#!/usr/bin/env node
/**
 * One-shot seed for analytics demo tenant.
 * Reads .env.local (service role). Prints login email + password once.
 * Idempotent on org slug quan-test-analytics (skips if already seeded heavily).
 */
const fs = require("node:fs");
const path = require("node:path");

const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");
const root = path.resolve(__dirname, "..");

function loadEnv(file) {
  const raw = fs.readFileSync(file, "utf8");
  const out = {};
  for (const line of raw.split("\n")) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

function fail(msg, err) {
  console.error(msg, err?.message ?? err ?? "");
  process.exit(1);
}

function dayOffsetIso(daysAgo, hour = 11) {
  const d = new Date();
  d.setHours(hour, 30, 0, 0);
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

const env = loadEnv(path.join(root, ".env.local"));
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  fail("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const EMAIL = process.env.ANALYTICS_DEMO_EMAIL || "analytics.demo@example.com";
// Override with ANALYTICS_DEMO_PASSWORD. Not committed; printed at end of run.
const PASSWORD = process.env.ANALYTICS_DEMO_PASSWORD || "AnalyticsDemo2026!";
const ORG_SLUG = "quan-test-analytics";
const ORG_NAME = "Quán test analytics";

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws },
});

async function ensureUser() {
  const listed = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  if (listed.error) fail("listUsers", listed.error);
  let user = listed.data.users.find((u) => u.email === EMAIL);
  let passwordShown = null;
  if (!user) {
    const created = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: "Analytics Demo Owner" },
    });
    if (created.error) fail("createUser", created.error);
    user = created.data.user;
    passwordShown = PASSWORD;
    console.log("Created auth user", EMAIL);
  } else {
    const updated = await supabase.auth.admin.updateUserById(user.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (updated.error) fail("updateUser password", updated.error);
    passwordShown = PASSWORD;
    console.log("Reused auth user", EMAIL, "(password reset for this run)");
  }
  return { user, passwordShown };
}

async function ensureOrg(userId) {
  const { data: existing } = await supabase.from("organizations").select("id,name,slug").eq("slug", ORG_SLUG).maybeSingle();
  if (existing) {
    const { data: branch } = await supabase.from("branches").select("id,name").eq("organization_id", existing.id).order("created_at").limit(1).maybeSingle();
    if (!branch) fail("Org exists without branch");
    await supabase.from("profiles").upsert({ id: userId, full_name: "Analytics Demo Owner", default_organization_id: existing.id });
    const { data: mem } = await supabase
      .from("memberships")
      .select("id")
      .eq("organization_id", existing.id)
      .eq("user_id", userId)
      .eq("role", "owner")
      .maybeSingle();
    if (!mem) {
      const { error } = await supabase.from("memberships").insert({
        organization_id: existing.id,
        branch_id: null,
        user_id: userId,
        role: "owner",
        status: "active",
        invited_by: userId,
        joined_at: new Date().toISOString(),
      });
      if (error) fail("membership insert", error);
    }
    console.log("Reused org", existing.id, "branch", branch.id);
    return { orgId: existing.id, branchId: branch.id };
  }

  await supabase.from("profiles").upsert({ id: userId, full_name: "Analytics Demo Owner" });

  const { data: org, error: orgErr } = await supabase
    .from("organizations")
    .insert({ name: ORG_NAME, slug: ORG_SLUG, business_type: "restaurant" })
    .select("id")
    .single();
  if (orgErr) fail("org insert", orgErr);

  const { data: branch, error: branchErr } = await supabase
    .from("branches")
    .insert({
      organization_id: org.id,
      name: "Chi nhánh trung tâm",
      address: "1 Nguyễn Huệ, Q1, HCM",
      phone: "0909000000",
    })
    .select("id")
    .single();
  if (branchErr) fail("branch insert", branchErr);

  const { error: memErr } = await supabase.from("memberships").insert({
    organization_id: org.id,
    branch_id: null,
    user_id: userId,
    role: "owner",
    status: "active",
    invited_by: userId,
    joined_at: new Date().toISOString(),
  });
  if (memErr) fail("membership", memErr);

  await supabase.from("profiles").update({ default_organization_id: org.id }).eq("id", userId);

  await supabase.from("sales_channels").insert([
    { organization_id: org.id, name: "Tại quán", type: "direct" },
    { organization_id: org.id, name: "Mang đi", type: "direct" },
    { organization_id: org.id, name: "GrabFood", type: "delivery" },
    { organization_id: org.id, name: "ShopeeFood", type: "delivery" },
    { organization_id: org.id, name: "BeFood", type: "delivery" },
    { organization_id: org.id, name: "Online", type: "online" },
  ]);

  await supabase.from("menu_categories").insert(
    [
      { name: "Cà phê", menu_type: "drink" },
      { name: "Trà", menu_type: "drink" },
      { name: "Đồ ăn", menu_type: "food" },
      { name: "Khác", menu_type: "other" },
    ].map((c, i) => ({
      organization_id: org.id,
      name: c.name,
      menu_type: c.menu_type,
      sort_order: i + 1,
    })),
  );

  console.log("Created org", org.id, "branch", branch.id);
  return { orgId: org.id, branchId: branch.id };
}

async function seedCatalog(orgId, branchId) {
  const { data: cats } = await supabase.from("menu_categories").select("id,name").eq("organization_id", orgId);
  const cat = Object.fromEntries((cats ?? []).map((c) => [c.name, c.id]));

  const invRows = [
    { name: "Cà phê bột", code: "INV-CF-BOT", item_type: "ingredient", unit: "g", cost_price: 5, can_be_ingredient: true, can_be_sold: false },
    { name: "Sữa đặc", code: "INV-SUA-DAC", item_type: "ingredient", unit: "ml", cost_price: 2, can_be_ingredient: true, can_be_sold: false },
    { name: "Thịt bò", code: "INV-BO", item_type: "ingredient", unit: "kg", cost_price: 280000, can_be_ingredient: true, can_be_sold: false },
  ];
  for (const row of invRows) {
    const { data: ex } = await supabase.from("inventory_items").select("id").eq("organization_id", orgId).eq("code", row.code).maybeSingle();
    if (!ex) {
      const { data, error } = await supabase
        .from("inventory_items")
        .insert({ organization_id: orgId, ...row, is_active: true })
        .select("id")
        .single();
      if (error) fail("inventory", error);
      await supabase.from("inventory_balances").insert({
        organization_id: orgId,
        branch_id: branchId,
        inventory_item_id: data.id,
        quantity_on_hand: row.code === "INV-BO" ? 10 : 5000,
        low_stock_threshold: 1,
      });
    }
  }
  const { data: inv } = await supabase.from("inventory_items").select("id,code").eq("organization_id", orgId);
  const invByCode = Object.fromEntries((inv ?? []).map((i) => [i.code, i.id]));

  const productsSpec = [
    {
      name: "Cà phê sữa",
      code: "CF-SUA",
      category_id: cat["Cà phê"],
      menu_type: "drink",
      product_type: "prepared",
      cost_price: 8000,
      sale_price: 35000,
      unit: "ly",
      recipe: [
        { inventoryItemId: invByCode["INV-CF-BOT"], quantity: 18, unit: "g" },
        { inventoryItemId: invByCode["INV-SUA-DAC"], quantity: 30, unit: "ml" },
      ],
    },
    {
      name: "Bò lúc lắc",
      code: "BO-LL",
      category_id: cat["Đồ ăn"],
      menu_type: "food",
      product_type: "prepared",
      cost_price: 45000,
      sale_price: 129000,
      unit: "phần",
      recipe: [{ inventoryItemId: invByCode["INV-BO"], quantity: 0.2, unit: "kg" }],
    },
    {
      name: "Nước suối",
      code: "NUOC",
      category_id: cat["Khác"],
      menu_type: "drink",
      product_type: "regular",
      cost_price: 4000,
      sale_price: 15000,
      unit: "chai",
      recipe: null,
    },
  ];

  const productIds = {};
  for (const p of productsSpec) {
    let { data: existing } = await supabase.from("products").select("id").eq("organization_id", orgId).eq("code", p.code).maybeSingle();
    if (!existing) {
      const { data, error } = await supabase
        .from("products")
        .insert({
          organization_id: orgId,
          name: p.name,
          code: p.code,
          category_id: p.category_id ?? null,
          menu_type: p.menu_type,
          product_type: p.product_type,
          cost_price: p.cost_price,
          sale_price: p.sale_price,
          unit: p.unit,
          is_active: true,
        })
        .select("id")
        .single();
      if (error) fail("product " + p.code, error);
      existing = data;
      if (p.recipe?.length) {
        const { data: recipe, error: rErr } = await supabase
          .from("recipes")
          .insert({ organization_id: orgId, product_id: data.id, version: 1, is_active: true })
          .select("id")
          .single();
        if (rErr) fail("recipe", rErr);
        const { error: riErr } = await supabase.from("recipe_items").insert(
          p.recipe.map((line) => ({
            recipe_id: recipe.id,
            inventory_item_id: line.inventoryItemId,
            quantity: line.quantity,
            unit: line.unit,
            estimated_cost: 0,
          })),
        );
        if (riErr) fail("recipe_items", riErr);
      }
    }
    productIds[p.code] = existing.id;
  }

  const { data: products } = await supabase.from("products").select("id,code,name,sale_price,cost_price").eq("organization_id", orgId);
  return Object.fromEntries((products ?? []).map((p) => [p.code, p]));
}

async function seedCustomers(orgId) {
  const specs = [
    { name: "An Champions", phone: "0901000001", birthday: "1998-01-15" },
    { name: "Bình Loyal", phone: "0901000002", birthday: "1995-06-20" },
    { name: "Chi Potential", phone: "0901000003", birthday: "1988-03-01" },
    { name: "Dũng AtRisk", phone: "0901000004", birthday: "2001-11-11" },
    { name: "Em Lost", phone: "0901000005", birthday: "1975-09-09" },
    { name: "Phong Weekend", phone: "0901000006", birthday: "1990-12-02" },
  ];
  const ids = {};
  for (const c of specs) {
    const { data: ex } = await supabase.from("customers").select("id").eq("organization_id", orgId).eq("phone", c.phone).maybeSingle();
    if (ex) {
      ids[c.phone] = ex.id;
      continue;
    }
    const { data, error } = await supabase
      .from("customers")
      .insert({ organization_id: orgId, name: c.name, phone: c.phone, birthday: c.birthday })
      .select("id")
      .single();
    if (error) fail("customer", error);
    ids[c.phone] = data.id;
  }
  return ids;
}

async function insertPaidOrder({ orgId, branchId, userId, orderNumber, customerId, openedAt, items, products }) {
  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("branch_id", branchId)
    .eq("order_number", orderNumber)
    .maybeSingle();
  if (existing) return existing.id;

  let subtotal = 0;
  const lines = items.map((it) => {
    const p = products[it.code];
    const line = p.sale_price * it.qty;
    subtotal += line;
    return { p, qty: it.qty };
  });

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      organization_id: orgId,
      branch_id: branchId,
      order_number: orderNumber,
      customer_id: customerId,
      order_type: "takeaway",
      status: "paid",
      subtotal,
      discount_amount: 0,
      tax_amount: 0,
      service_fee_amount: 0,
      total_amount: subtotal,
      paid_amount: subtotal,
      debt_amount: 0,
      opened_by: userId,
      closed_by: userId,
      opened_at: openedAt,
      closed_at: openedAt,
    })
    .select("id")
    .single();
  if (error) fail("order " + orderNumber, error);

  const { error: oiErr } = await supabase.from("order_items").insert(
    lines.map(({ p, qty }) => ({
      organization_id: orgId,
      branch_id: branchId,
      order_id: order.id,
      product_id: p.id,
      product_name_snapshot: p.name,
      unit_price_snapshot: p.sale_price,
      cost_price_snapshot: p.cost_price,
      quantity: qty,
      kitchen_status: "served",
    })),
  );
  if (oiErr) fail("order_items", oiErr);

  const { error: payErr } = await supabase.from("payments").insert({
    organization_id: orgId,
    branch_id: branchId,
    order_id: order.id,
    method: "cash",
    amount: subtotal,
    paid_at: openedAt,
    received_by: userId,
  });
  if (payErr) fail("payment", payErr);
  return order.id;
}

async function seedOrders(orgId, branchId, userId, products, customers) {
  const phones = Object.keys(customers);
  // Distinct RFM patterns + 20 calendar days of dish demand (CF-SUA + BO-LL)
  const plan = [];
  // Champions: many recent
  for (const d of [0, 1, 2, 3, 5, 7]) {
    plan.push({ phone: phones[0], daysAgo: d, items: [{ code: "CF-SUA", qty: 2 }, { code: "BO-LL", qty: 1 }], hour: 18 });
  }
  // Loyal
  for (const d of [2, 8, 14]) {
    plan.push({ phone: phones[1], daysAgo: d, items: [{ code: "CF-SUA", qty: 1 }], hour: 10 });
  }
  // Potential
  plan.push({ phone: phones[2], daysAgo: 4, items: [{ code: "NUOC", qty: 3 }], hour: 12 });
  plan.push({ phone: phones[2], daysAgo: 11, items: [{ code: "CF-SUA", qty: 1 }], hour: 12 });
  // At risk: was frequent, last long ago
  plan.push({ phone: phones[3], daysAgo: 40, items: [{ code: "BO-LL", qty: 1 }], hour: 19 });
  plan.push({ phone: phones[3], daysAgo: 45, items: [{ code: "BO-LL", qty: 1 }], hour: 19 });
  // Lost: single old order
  plan.push({ phone: phones[4], daysAgo: 90, items: [{ code: "NUOC", qty: 1 }], hour: 9 });
  // Weekend-ish
  plan.push({ phone: phones[5], daysAgo: 6, items: [{ code: "CF-SUA", qty: 1 }, { code: "BO-LL", qty: 1 }], hour: 20 });

  // Fill 14+ distinct days for CF-SUA demand series (walk-in allowed on some days)
  for (let d = 0; d < 18; d++) {
    plan.push({
      phone: d % 3 === 0 ? null : phones[d % phones.length],
      daysAgo: d,
      items: [{ code: "CF-SUA", qty: 1 + (d % 3) }],
      hour: 11,
      tag: `DEMAND-${d}`,
    });
    if (d % 2 === 0) {
      plan.push({
        phone: null,
        daysAgo: d,
        items: [{ code: "BO-LL", qty: 1 }],
        hour: 12,
        tag: `DEMAND-BO-${d}`,
      });
    }
  }

  let n = 0;
  for (const row of plan) {
    n += 1;
    const orderNumber = row.tag ? `AT-${row.tag}` : `AT-RFM-${String(n).padStart(3, "0")}`;
    await insertPaidOrder({
      orgId,
      branchId,
      userId,
      orderNumber,
      customerId: row.phone ? customers[row.phone] : null,
      openedAt: dayOffsetIso(row.daysAgo, row.hour),
      items: row.items,
      products,
    });
  }
  console.log("Paid orders upserted (plan size)", plan.length);
}

async function seedFeedback(orgId, branchId, customers) {
  const samples = [
    { phone: "0901000001", rating: 5, text: "Cà phê ngon, sẽ quay lại." },
    { phone: "0901000002", rating: 4, text: "Ổn nhưng hơi đông." },
    {
      phone: "0901000003",
      rating: 5,
      text: "Đồ ăn ngon nhưng phục vụ chậm, thái độ kém.",
    },
    { phone: "0901000004", rating: 2, text: "Thất vọng, món nguội." },
  ];
  for (const s of samples) {
    const { data: ex } = await supabase
      .from("customer_feedback")
      .select("id")
      .eq("organization_id", orgId)
      .eq("branch_id", branchId)
      .eq("customer_id", customers[s.phone])
      .eq("feedback_text", s.text)
      .maybeSingle();
    if (ex) continue;
    const { error } = await supabase.from("customer_feedback").insert({
      organization_id: orgId,
      branch_id: branchId,
      customer_id: customers[s.phone],
      rating: s.rating,
      feedback_text: s.text,
      sentiment_label: null,
      sentiment_score: null,
      model_name: null,
      scored_at: null,
    });
    if (error) fail("feedback", error);
  }
  console.log("Feedback rows ready");
}

async function refreshFeatures(orgId, branchId) {
  // RPC is security invoker + role check; must run as the owner session, not service role.
  const { error: loginErr } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (loginErr) {
    console.warn("signIn for refresh:", loginErr.message);
    return;
  }
  const { data, error } = await anon.rpc("refresh_customer_features", {
    p_org: orgId,
    p_branch: branchId,
    p_as_of: new Date().toISOString(),
  });
  if (error) {
    console.warn("refresh_customer_features RPC:", error.message);
    return;
  }
  console.log("refresh_customer_features updated", data);
  await anon.auth.signOut();
}

async function main() {
  const { user, passwordShown } = await ensureUser();
  const { orgId, branchId } = await ensureOrg(user.id);
  const products = await seedCatalog(orgId, branchId);
  const customers = await seedCustomers(orgId);
  await seedOrders(orgId, branchId, user.id, products, customers);
  await seedFeedback(orgId, branchId, customers);
  await refreshFeatures(orgId, branchId);

  const { count: paidCount } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "paid");
  const { count: withCustomer } = await supabase
    .from("orders")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "paid")
    .not("customer_id", "is", null);
  const { count: featCount } = await supabase
    .from("customer_features")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("branch_id", branchId);

  console.log("\n=== Analytics demo tenant ready ===");
  console.log("email:", EMAIL);
  console.log("password:", passwordShown);
  console.log("org:", orgId, ORG_SLUG);
  console.log("branch:", branchId);
  console.log("paid orders:", paidCount, "with customer_id:", withCustomer);
  console.log("customer_features rows:", featCount);
  console.log("Login: http://localhost:3000/login then open /analytics");
  console.log("Owner must click Cập nhật dữ liệu / fit cụm / dự báo trên UI.");
}

main().catch((e) => fail("fatal", e));
