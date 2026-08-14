import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClusterProfile } from "@/lib/analytics/kmeans";
import { holtWintersForecast } from "@/lib/analytics/holt-winters";
import {
  addCalendarDay,
  DEMAND_DEFAULT_HORIZON,
  DEMAND_LOOKBACK_DAYS,
  DEMAND_MIN_OBSERVED_DAYS,
  explodeBom,
  fillDailySeries,
  pickLatestRecipeVersion,
  purchaseHint,
  vnYmd,
  type RecipeBomLine,
} from "@/lib/analytics/demand";
import type {
  ClusterCustomerRow,
  ClusterProfileRow,
  CustomerClustersView,
  DemandForecastView,
  FeedbackListRow,
  RfmCustomerRow,
  RfmSegment,
  RfmSummaryRow,
  SentimentSummary,
} from "@/types/analytics";

export const RFM_VS_CLUSTER_REMINDER = "RFM là value segment, cluster là hành vi";

function asSegment(value: string | null): RfmSegment | null {
  if (
    value === "Champions"
    || value === "Loyal Customers"
    || value === "Potential Loyalists"
    || value === "At Risk"
    || value === "Lost"
  ) {
    return value;
  }
  return null;
}

export async function getRfmSummary(
  organizationId: string,
  branchId: string,
): Promise<RfmSummaryRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_features")
    .select("rfm_segment, monetary")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId);
  if (error || !data) return [];

  const groups = new Map<string, { count: number; monetary: number }>();
  for (const row of data) {
    const key = row.rfm_segment ?? "";
    const group = groups.get(key) ?? { count: 0, monetary: 0 };
    group.count += 1;
    group.monetary += Number(row.monetary ?? 0);
    groups.set(key, group);
  }

  return Array.from(groups.entries()).map(([key, group]) => ({
    segment: asSegment(key || null),
    customerCount: group.count,
    avgMonetary: group.count === 0 ? 0 : group.monetary / group.count,
  }));
}

export async function getRfmCustomers(
  organizationId: string,
  branchId: string,
  segment?: RfmSegment,
): Promise<RfmCustomerRow[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("customer_features")
    .select(
      "customer_id, recency_days, frequency, monetary, r_score, f_score, m_score, rfm_segment",
    )
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .order("monetary", { ascending: false })
    .limit(100);
  if (segment) query = query.eq("rfm_segment", segment);

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row) => ({
    customerId: row.customer_id,
    recencyDays: Number(row.recency_days),
    frequency: Number(row.frequency),
    monetary: Number(row.monetary),
    rScore: row.r_score,
    fScore: row.f_score,
    mScore: row.m_score,
    segment: asSegment(row.rfm_segment),
  }));
}

const SENTIMENT_SUMMARY_DAYS = 90;

export async function getSentimentSummary(
  organizationId: string,
  branchId: string,
): Promise<SentimentSummary> {
  const supabase = createSupabaseServerClient();
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - SENTIMENT_SUMMARY_DAYS);
  from.setHours(0, 0, 0, 0);

  const { data, error } = await supabase.rpc("ai_sentiment_summary", {
    p_org_id: organizationId,
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error || !data) return { positive: 0, neutral: 0, negative: 0 };

  const counts: SentimentSummary = { positive: 0, neutral: 0, negative: 0 };
  for (const row of data) {
    const label = row.sentiment_label as string | null;
    if (label === "positive") counts.positive = Number(row.feedback_count);
    else if (label === "neutral") counts.neutral = Number(row.feedback_count);
    else if (label === "negative") counts.negative = Number(row.feedback_count);
  }
  return counts;
}

export async function getRecentFeedback(
  organizationId: string,
  branchId: string,
): Promise<FeedbackListRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_feedback")
    .select("id, rating, feedback_text, sentiment_label, sentiment_score, created_at")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    rating: row.rating,
    feedbackText: row.feedback_text,
    sentimentLabel: row.sentiment_label,
    sentimentScore: row.sentiment_score == null ? null : Number(row.sentiment_score),
    createdAt: row.created_at,
  }));
}

function asClusterProfiles(value: unknown): ClusterProfileRow[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Partial<ClusterProfile>;
    if (typeof item.cluster_id !== "number") return [];
    return [{
      cluster_id: item.cluster_id,
      size: Number(item.size ?? 0),
      avg_recency: Number(item.avg_recency ?? 0),
      avg_frequency: Number(item.avg_frequency ?? 0),
      avg_monetary: Number(item.avg_monetary ?? 0),
      dinner_ratio: Number(item.dinner_ratio ?? 0),
      weekend_ratio: Number(item.weekend_ratio ?? 0),
      top_category: item.top_category ?? null,
      label: String(item.label ?? `Nhóm ${item.cluster_id}`),
    }];
  });
}

export async function getCustomerClusters(
  organizationId: string,
  branchId: string,
): Promise<CustomerClustersView> {
  const supabase = createSupabaseServerClient();
  const [{ data: fit }, { data: customers }] = await Promise.all([
    supabase
      .from("customer_clusters")
      .select("k, silhouette, profiles, fitted_at")
      .eq("organization_id", organizationId)
      .eq("branch_id", branchId)
      .order("fitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("customer_features")
      .select("customer_id, cluster_id, rfm_segment, recency_days, frequency, monetary")
      .eq("organization_id", organizationId)
      .eq("branch_id", branchId)
      .not("cluster_id", "is", null)
      .order("monetary", { ascending: false })
      .limit(100),
  ]);

  const mappedCustomers: ClusterCustomerRow[] = (customers ?? []).map((row) => ({
    customerId: row.customer_id,
    clusterId: row.cluster_id,
    rfmSegment: asSegment(row.rfm_segment),
    recencyDays: Number(row.recency_days),
    frequency: Number(row.frequency),
    monetary: Number(row.monetary),
  }));

  return {
    k: fit?.k ?? 0,
    silhouette: fit?.silhouette == null ? null : Number(fit.silhouette),
    fittedAt: fit?.fitted_at ?? null,
    profiles: asClusterProfiles(fit?.profiles),
    customers: mappedCustomers,
    reminder: RFM_VS_CLUSTER_REMINDER,
  };
}

export async function getDemandForecasts(
  organizationId: string,
  branchId: string,
  horizonDays = 14,
): Promise<DemandForecastView> {
  const supabase = createSupabaseServerClient();
  const [{ data: rows, error }, { data: balances }] = await Promise.all([
    supabase
      .from("demand_forecasts")
      .select(
        "product_id, inventory_item_id, target_date, forecast_qty, computed_at, method, horizon_days, products(name), inventory_items(name, unit)",
      )
      .eq("organization_id", organizationId)
      .eq("branch_id", branchId)
      .order("target_date", { ascending: true }),
    supabase
      .from("inventory_balances")
      .select("inventory_item_id, quantity_on_hand")
      .eq("organization_id", organizationId)
      .eq("branch_id", branchId),
  ]);
  if (error || !rows || rows.length === 0) {
    return {
      dishes: [],
      ingredients: [],
      computedAt: null,
      method: null,
      horizonDays,
      insufficientData: true,
    };
  }

  const onHandByItem = new Map<string, number>();
  for (const row of balances ?? []) {
    onHandByItem.set(row.inventory_item_id, Number(row.quantity_on_hand ?? 0));
  }

  const dates = Array.from(new Set(rows.map((row) => row.target_date))).sort();
  const keepDates = new Set(dates.slice(0, horizonDays));
  const dishQty = new Map<string, { name: string; qty7: number; qty14: number }>();
  const ingredientQty = new Map<string, { name: string; unit: string; qty: number }>();

  for (const row of rows) {
    if (!keepDates.has(row.target_date)) continue;
    const qty = Number(row.forecast_qty ?? 0);
    const dayIndex = dates.indexOf(row.target_date);
    if (row.product_id) {
      const name = (row.products as { name?: string } | null)?.name ?? "Món";
      const current = dishQty.get(row.product_id) ?? { name, qty7: 0, qty14: 0 };
      if (dayIndex < 7) current.qty7 += qty;
      current.qty14 += qty;
      dishQty.set(row.product_id, current);
    }
    if (row.inventory_item_id) {
      const item = row.inventory_items as { name?: string; unit?: string } | null;
      const current = ingredientQty.get(row.inventory_item_id) ?? {
        name: item?.name ?? "Nguyên liệu",
        unit: item?.unit ?? "",
        qty: 0,
      };
      current.qty += qty;
      ingredientQty.set(row.inventory_item_id, current);
    }
  }

  return {
    dishes: Array.from(dishQty.entries())
      .map(([productId, row]) => ({
        productId,
        productName: row.name,
        qty7: row.qty7,
        qty14: row.qty14,
      }))
      .sort((a, b) => b.qty14 - a.qty14),
    ingredients: Array.from(ingredientQty.entries())
      .map(([inventoryItemId, row]) => {
        const onHand = onHandByItem.get(inventoryItemId) ?? 0;
        return {
          inventoryItemId,
          name: row.name,
          unit: row.unit,
          forecastQty: row.qty,
          onHand,
          suggestedPurchase: purchaseHint(row.qty, onHand),
        };
      })
      .sort((a, b) => b.suggestedPurchase - a.suggestedPurchase || b.forecastQty - a.forecastQty),
    computedAt: rows[0]?.computed_at ?? null,
    method: rows[0]?.method ?? null,
    horizonDays: Number(rows[0]?.horizon_days ?? horizonDays),
    insufficientData: dishQty.size === 0,
  };
}

type DemandSeriesRow = { product_id: string; day: string; qty: number };

function clampHorizon(horizonDays: number) {
  return Math.min(30, Math.max(7, Math.round(horizonDays)));
}

export async function computeAndPersistDemandForecasts(
  organizationId: string,
  branchId: string,
  horizonDays = DEMAND_DEFAULT_HORIZON,
): Promise<{ dishes: number; ingredients: number; insufficientData: boolean }> {
  const horizon = clampHorizon(horizonDays);
  const supabase = createSupabaseServerClient();
  const endDay = vnYmd(new Date());
  const startDay = addCalendarDay(endDay, -(DEMAND_LOOKBACK_DAYS - 1));

  const [{ data: series, error: seriesError }, { data: recipes, error: recipeError }] = await Promise.all([
    supabase.rpc("ai_dish_demand_series", {
      p_org_id: organizationId,
      p_branch_id: branchId,
      p_from: `${startDay}T00:00:00+07:00`,
      p_to: `${endDay}T23:59:59.999+07:00`,
    }),
    supabase
      .from("recipes")
      .select("product_id, version, recipe_items(inventory_item_id, quantity, unit)")
      .eq("organization_id", organizationId)
      .eq("is_active", true),
  ]);
  if (seriesError) throw new Error(seriesError.message);
  if (recipeError) throw new Error(recipeError.message);

  const bom: RecipeBomLine[] = [];
  for (const recipe of pickLatestRecipeVersion(recipes ?? [])) {
    for (const item of (recipe.recipe_items ?? []) as Array<{
      inventory_item_id: string;
      quantity: number;
      unit: string;
    }>) {
      bom.push({
        productId: recipe.product_id,
        inventoryItemId: item.inventory_item_id,
        quantityPerDish: Number(item.quantity),
        unit: item.unit,
      });
    }
  }

  const byProduct = new Map<string, DemandSeriesRow[]>();
  for (const row of (series ?? []) as DemandSeriesRow[]) {
    const day = String(row.day).slice(0, 10);
    const list = byProduct.get(row.product_id) ?? [];
    list.push({ product_id: row.product_id, day, qty: Number(row.qty) });
    byProduct.set(row.product_id, list);
  }

  const computedAt = new Date().toISOString();
  const inserts: Array<{
    organization_id: string;
    branch_id: string;
    horizon_days: number;
    method: string;
    product_id: string | null;
    inventory_item_id: string | null;
    target_date: string;
    forecast_qty: number;
    lower_qty: number | null;
    upper_qty: number | null;
    computed_at: string;
  }> = [];

  const dishIds: string[] = [];
  let method = "holt_winters";

  for (const [productId, points] of Array.from(byProduct.entries())) {
    const observedDays = new Set(points.map((point: DemandSeriesRow) => point.day)).size;
    if (observedDays < DEMAND_MIN_OBSERVED_DAYS) continue;
    const filled = fillDailySeries(points, startDay, endDay);
    const forecast = holtWintersForecast(filled, horizon, 7);
    if (forecast.insufficientData || forecast.points.length === 0) continue;
    method = forecast.method;
    dishIds.push(productId);
    for (let h = 0; h < forecast.points.length; h++) {
      inserts.push({
        organization_id: organizationId,
        branch_id: branchId,
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

  const ingredientIds = new Set<string>();
  if (dishIds.length > 0) {
    for (let h = 0; h < horizon; h++) {
      const targetDate = addCalendarDay(endDay, h + 1);
      const dishForecasts = inserts
        .filter((row) => row.product_id && row.target_date === targetDate)
        .map((row) => ({ productId: row.product_id as string, qty: row.forecast_qty }));
      const ingredients = explodeBom(dishForecasts, bom);
      for (const item of ingredients) {
        ingredientIds.add(item.inventoryItemId);
        inserts.push({
          organization_id: organizationId,
          branch_id: branchId,
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

  if (inserts.length > 0) {
    const { error: upsertError } = await supabase.from("demand_forecasts").upsert(inserts, {
      onConflict: "branch_id,target_date,product_id,inventory_item_id",
    });
    if (upsertError) throw new Error(upsertError.message);

    const { error: pruneError } = await supabase
      .from("demand_forecasts")
      .delete()
      .eq("organization_id", organizationId)
      .eq("branch_id", branchId)
      .lt("computed_at", computedAt);
    if (pruneError) throw new Error(pruneError.message);
  }

  return {
    dishes: dishIds.length,
    ingredients: ingredientIds.size,
    insufficientData: dishIds.length === 0,
  };
}
