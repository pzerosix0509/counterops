#!/usr/bin/env node
/**
 * Score RFM, fit KMeans, persist demand for quan-test-analytics as owner session.
 * Run after seed-analytics-test-tenant.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");

const root = path.resolve(__dirname, "..");
function loadEnv(file) {
  const out = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

const env = loadEnv(path.join(root, ".env.local"));
const EMAIL = process.env.ANALYTICS_DEMO_EMAIL || "analytics.demo@example.com";
const PASSWORD = process.env.ANALYTICS_DEMO_PASSWORD || "AnalyticsDemo2026!";
const ORG_SLUG = "quan-test-analytics";

async function main() {
  // Dynamic import TS modules via tsx register
  require("tsx/cjs");
  const { applyRfmToFeatures, DEFAULT_RFM_RULES } = require("../src/lib/analytics/rfm.ts");
  const { chooseKAndFit, buildClusterProfiles } = require("../src/lib/analytics/kmeans.ts");
  const {
    DEMAND_DEFAULT_HORIZON,
    DEMAND_LOOKBACK_DAYS,
    DEMAND_MIN_OBSERVED_DAYS,
    fillDailySeries,
    explodeBom,
    pickLatestRecipeVersion,
    addCalendarDay,
    vnYmd,
  } = require("../src/lib/analytics/demand.ts");
  const { holtWintersForecast } = require("../src/lib/analytics/holt-winters.ts");

  const userClient = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  });
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: ws },
  });

  const { error: loginErr } = await userClient.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (loginErr) throw loginErr;

  const { data: orgRow, error: orgErr } = await admin.from("organizations").select("id").eq("slug", ORG_SLUG).single();
  if (orgErr) throw orgErr;
  const ORG = orgRow.id;
  const { data: branchRow, error: brErr } = await admin
    .from("branches")
    .select("id")
    .eq("organization_id", ORG)
    .order("created_at")
    .limit(1)
    .single();
  if (brErr) throw brErr;
  const BRANCH = branchRow.id;
  console.log("org", ORG, "branch", BRANCH);

  const { data: updated, error: rpcErr } = await userClient.rpc("refresh_customer_features", {
    p_org: ORG,
    p_branch: BRANCH,
    p_as_of: new Date().toISOString(),
  });
  if (rpcErr) throw rpcErr;
  console.log("features refreshed", updated);

  const { data: features, error: fErr } = await userClient
    .from("customer_features")
    .select("*")
    .eq("organization_id", ORG)
    .eq("branch_id", BRANCH);
  if (fErr) throw fErr;

  const scored = applyRfmToFeatures(features ?? [], DEFAULT_RFM_RULES, new Date());
  for (const row of scored) {
    const { error } = await userClient
      .from("customer_features")
      .update({
        r_score: row.r_score,
        f_score: row.f_score,
        m_score: row.m_score,
        rfm_segment: row.rfm_segment,
      })
      .eq("id", row.id);
    if (error) throw error;
  }
  console.log(
    "RFM segments",
    scored.map((r) => r.rfm_segment),
  );

  const fit = chooseKAndFit(scored.length ? scored : features);
  if (fit.insufficient_data) {
    console.warn("KMeans insufficient_data");
  } else {
    const profiles = buildClusterProfiles(features, fit.labels);
    for (let i = 0; i < features.length; i++) {
      const { error } = await userClient
        .from("customer_features")
        .update({ cluster_id: fit.labels[i] })
        .eq("id", features[i].id);
      if (error) throw error;
    }
    const { error: cErr } = await userClient.from("customer_clusters").insert({
      organization_id: ORG,
      branch_id: BRANCH,
      k: fit.k,
      silhouette: fit.silhouette,
      feature_names: fit.featureNames,
      profiles,
      fitted_at: new Date().toISOString(),
    });
    if (cErr) throw cErr;
    console.log("KMeans k=", fit.k, "silhouette=", fit.silhouette);
  }

  // Demand
  const endDay = vnYmd(new Date());
  const startDay = addCalendarDay(endDay, -(DEMAND_LOOKBACK_DAYS - 1));
  const [{ data: series, error: seriesError }, { data: recipes, error: recipeError }] = await Promise.all([
    userClient.rpc("ai_dish_demand_series", {
      p_org_id: ORG,
      p_branch_id: BRANCH,
      p_from: `${startDay}T00:00:00+07:00`,
      p_to: `${endDay}T23:59:59.999+07:00`,
    }),
    userClient
      .from("recipes")
      .select("product_id, version, recipe_items(inventory_item_id, quantity, unit)")
      .eq("organization_id", ORG)
      .eq("is_active", true),
  ]);
  if (seriesError) throw seriesError;
  if (recipeError) throw recipeError;

  const bom = [];
  for (const recipe of pickLatestRecipeVersion(recipes ?? [])) {
    for (const item of recipe.recipe_items ?? []) {
      bom.push({
        productId: recipe.product_id,
        inventoryItemId: item.inventory_item_id,
        quantityPerDish: Number(item.quantity),
        unit: item.unit,
      });
    }
  }

  const byProduct = new Map();
  for (const row of series ?? []) {
    const day = String(row.day).slice(0, 10);
    const list = byProduct.get(row.product_id) ?? [];
    list.push({ product_id: row.product_id, day, qty: Number(row.qty) });
    byProduct.set(row.product_id, list);
  }

  const horizon = DEMAND_DEFAULT_HORIZON;
  const computedAt = new Date().toISOString();
  const inserts = [];
  const dishIds = [];
  let method = "holt_winters";

  for (const [productId, points] of byProduct.entries()) {
    const observedDays = new Set(points.map((p) => p.day)).size;
    console.log("product", productId, "observedDays", observedDays);
    if (observedDays < DEMAND_MIN_OBSERVED_DAYS) continue;
    const filled = fillDailySeries(points, startDay, endDay);
    const forecast = holtWintersForecast(filled, horizon, 7);
    if (forecast.insufficientData || forecast.points.length === 0) continue;
    method = forecast.method;
    dishIds.push(productId);
    for (let h = 0; h < forecast.points.length; h++) {
      inserts.push({
        organization_id: ORG,
        branch_id: BRANCH,
        horizon_days: horizon,
        method: forecast.method,
        product_id: productId,
        inventory_item_id: null,
        target_date: addCalendarDay(endDay, h + 1),
        forecast_qty: forecast.points[h],
        lower_qty: forecast.lower[h] ?? null,
        upper_qty: forecast.upper[h] ?? null,
        computed_at: computedAt,
      });
    }
  }

  if (dishIds.length > 0) {
    for (let h = 0; h < horizon; h++) {
      const targetDate = addCalendarDay(endDay, h + 1);
      const dishForecasts = inserts
        .filter((row) => row.product_id && row.target_date === targetDate)
        .map((row) => ({ productId: row.product_id, qty: row.forecast_qty }));
      const ingredients = explodeBom(dishForecasts, bom);
      for (const item of ingredients) {
        inserts.push({
          organization_id: ORG,
          branch_id: BRANCH,
          horizon_days: horizon,
          method,
          product_id: null,
          inventory_item_id: item.inventoryItemId,
          target_date: targetDate,
          forecast_qty: item.qty,
          lower_qty: null,
          upper_qty: null,
          computed_at: computedAt,
        });
      }
    }
  }

  if (inserts.length) {
    await admin.from("demand_forecasts").delete().eq("organization_id", ORG).eq("branch_id", BRANCH);
    const { error: insErr } = await admin.from("demand_forecasts").insert(inserts);
    if (insErr) throw insErr;
  }
  console.log("demand inserts", inserts.length, "dishes", dishIds.length, "insufficient", dishIds.length === 0);

  // Sentiment: leave unscored for UI refresh (needs LLM). Count pending.
  const { count: pending } = await admin
    .from("customer_feedback")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", ORG)
    .eq("branch_id", BRANCH)
    .is("scored_at", null);
  console.log("feedback unscored", pending);

  await userClient.auth.signOut();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
