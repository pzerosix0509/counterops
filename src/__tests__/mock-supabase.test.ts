import { describe, it, expect } from "vitest";
import { createMockServerClient } from "@/lib/mock/supabase";
import {
  MOCK_ORG_ID,
  MOCK_BRANCH_ID,
  MOCK_USER_ID,
  MOCK_PRODUCTS,
  MOCK_CATEGORIES,
} from "@/lib/mock/data";

function getClient() {
  return createMockServerClient();
}

// ── Select + Filters ──

describe("MockQueryBuilder — select", () => {
  it("select * returns all rows", async () => {
    const client = getClient();
    const { data, error } = await client.from("products").select("*");
    expect(error).toBeNull();
    expect(data).toHaveLength(MOCK_PRODUCTS.length);
  });

  it("select with column projection", async () => {
    const client = getClient();
    const { data } = await client.from("products").select("id,name,sale_price");
    expect(data).toHaveLength(MOCK_PRODUCTS.length);
    expect(data![0]).toHaveProperty("name");
    expect(data![0]).toHaveProperty("sale_price");
  });

  it("eq filter", async () => {
    const client = getClient();
    const coffeeCatId = MOCK_CATEGORIES[0].id;
    const { data } = await client.from("products").select("*").eq("category_id", coffeeCatId);
    expect(data!.every((r: any) => r.category_id === coffeeCatId)).toBe(true);
    expect(data!.length).toBeGreaterThan(0);
  });

  it("neq filter", async () => {
    const client = getClient();
    const coffeeCatId = MOCK_CATEGORIES[0].id;
    const { data } = await client.from("products").select("*").neq("category_id", coffeeCatId);
    expect(data!.every((r: any) => r.category_id !== coffeeCatId)).toBe(true);
  });

  it("in filter", async () => {
    const client = getClient();
    const ids = [MOCK_CATEGORIES[0].id, MOCK_CATEGORIES[1].id];
    const { data } = await client.from("products").select("*").in("category_id", ids);
    expect(data!.every((r: any) => ids.includes(r.category_id))).toBe(true);
  });

  it("gte and lte filters", async () => {
    const client = getClient();
    const { data } = await client
      .from("products")
      .select("*")
      .gte("sale_price", 20000)
      .lte("sale_price", 35000);
    expect(data!.every((r: any) => r.sale_price >= 20000 && r.sale_price <= 35000)).toBe(true);
  });

  it("ilike filter", async () => {
    const client = getClient();
    const { data } = await client.from("products").select("*").ilike("name", "%Cà phê%");
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((r: any) => r.name.toLowerCase().includes("cà phê"))).toBe(true);
  });

  it('is(null) filter finds nulls', async () => {
    const client = getClient();
    const { data } = await client.from("products").select("*").is("deleted_at", null);
    expect(data!.every((r: any) => r.deleted_at == null)).toBe(true);
    expect(data!.length).toBeGreaterThan(0);
  });

  it("order ascending", async () => {
    const client = getClient();
    const { data } = await client.from("products").select("*").order("sale_price", { ascending: true });
    for (let i = 1; i < data!.length; i++) {
      expect(data![i].sale_price).toBeGreaterThanOrEqual(data![i - 1].sale_price);
    }
  });

  it("order descending", async () => {
    const client = getClient();
    const { data } = await client.from("products").select("*").order("sale_price", { ascending: false });
    for (let i = 1; i < data!.length; i++) {
      expect(data![i].sale_price).toBeLessThanOrEqual(data![i - 1].sale_price);
    }
  });

  it("limit", async () => {
    const client = getClient();
    const { data } = await client.from("products").select("*").limit(3);
    expect(data).toHaveLength(3);
  });

  it("single() returns one row", async () => {
    const client = getClient();
    const { data, error } = await client
      .from("organizations")
      .select("*")
      .eq("id", MOCK_ORG_ID)
      .single();
    expect(error).toBeNull();
    expect(data.id).toBe(MOCK_ORG_ID);
  });

  it("single() returns error when not found", async () => {
    const client = getClient();
    const { data, error } = await client
      .from("products")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000000")
      .single();
    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(error!.code).toBe("PGRST116");
  });

  it("maybeSingle() returns null when not found", async () => {
    const client = getClient();
    const { data, error } = await client
      .from("products")
      .select("*")
      .eq("id", "00000000-0000-0000-0000-000000000000")
      .maybeSingle();
    expect(data).toBeNull();
    expect(error).toBeNull();
  });

  it("count mode returns count", async () => {
    const client = getClient();
    const { data, count } = await client
      .from("products")
      .select("*", { count: "exact" });
    expect(count).toBe(MOCK_PRODUCTS.length);
    expect(data).toHaveLength(MOCK_PRODUCTS.length);
  });

  it("count head mode returns null data", async () => {
    const client = getClient();
    const { data, count } = await client
      .from("products")
      .select("*", { head: true, count: "exact" });
    expect(data).toBeNull();
    expect(count).toBe(MOCK_PRODUCTS.length);
  });
});

// ── Insert ──

describe("MockQueryBuilder — insert", () => {
  it("inserts a single row with auto-generated id and created_at", async () => {
    const client = getClient();
    const { data, error } = await client
      .from("menu_categories")
      .insert({ organization_id: MOCK_ORG_ID, name: "Test", sort_order: 99 })
      .select("*")
      .single();
    expect(error).toBeNull();
    expect(data.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(data.name).toBe("Test");
    expect(data.created_at).toBeTruthy();
  });

  it("inserts multiple rows", async () => {
    const client = getClient();
    const rows = [
      { organization_id: MOCK_ORG_ID, name: "A1", sort_order: 1 },
      { organization_id: MOCK_ORG_ID, name: "A2", sort_order: 2 },
    ];
    const { data, error } = await client
      .from("menu_categories")
      .insert(rows)
      .select("*");
    expect(error).toBeNull();
    expect(data).toHaveLength(2);
  });

  it("inserts a row with explicit id", async () => {
    const client = getClient();
    const testId = "99999999-9999-9999-9999-999999999999";
    const { data } = await client
      .from("menu_categories")
      .insert({ id: testId, organization_id: MOCK_ORG_ID, name: "Explicit ID", sort_order: 0 })
      .select("*")
      .single();
    expect(data.id).toBe(testId);
  });
});

// ── Update ──

describe("MockQueryBuilder — update", () => {
  it("updates rows matching filters", async () => {
    const client = getClient();
    const { data } = await client
      .from("menu_categories")
      .update({ name: "Updated" })
      .eq("name", "A1")
      .select("*");
    expect(data).toHaveLength(1);
    expect(data![0].name).toBe("Updated");
  });

  it("update with single()", async () => {
    const client = getClient();
    const { data, error } = await client
      .from("menu_categories")
      .update({ name: "Updated Single" })
      .eq("name", "A2")
      .select("*")
      .single();
    expect(error).toBeNull();
    expect(data.name).toBe("Updated Single");
  });
});

// ── Delete ──

describe("MockQueryBuilder — delete", () => {
  it("deletes rows matching filters", async () => {
    const client = getClient();
    const { data } = await client
      .from("menu_categories")
      .delete()
      .in("name", ["Updated", "Updated Single"]);
    expect(data).toHaveLength(2);
  });
});

// ── Upsert ──

describe("MockQueryBuilder — upsert", () => {
  it("inserts when row does not exist", async () => {
    const client = getClient();
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { data } = await client
      .from("menu_categories")
      .upsert({ id, organization_id: MOCK_ORG_ID, name: "Upserted", sort_order: 0 })
      .select("*")
      .single();
    expect(data.id).toBe(id);
    expect(data.name).toBe("Upserted");
  });

  it("updates when row already exists (same id)", async () => {
    const client = getClient();
    const id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    const { data } = await client
      .from("menu_categories")
      .upsert({ id, name: "Upserted Updated" })
      .select("*")
      .single();
    expect(data.id).toBe(id);
    expect(data.name).toBe("Upserted Updated");
  });
});

// ── RPC ──

describe("MockQueryBuilder — RPC", () => {
  const branchId = MOCK_BRANCH_ID;

  it("ai_sales_summary returns data", async () => {
    const client = getClient();
    const { data, error } = await client.rpc("ai_sales_summary", {
      p_branch_id: branchId,
      p_from: new Date(Date.now() - 86400000 * 30).toISOString(),
      p_to: new Date().toISOString(),
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0]).toHaveProperty("total_orders");
    expect(data[0]).toHaveProperty("net_revenue");
    expect(data[0]).toHaveProperty("gross_profit");
    expect(data[0]).toHaveProperty("net_profit");
  });

  it("ai_top_products returns product data", async () => {
    const client = getClient();
    const { data, error } = await client.rpc("ai_top_products", {
      p_branch_id: branchId,
      p_from: new Date(Date.now() - 86400000 * 30).toISOString(),
      p_to: new Date().toISOString(),
      p_limit: 5,
    });
    expect(error).toBeNull();
    expect(data.length).toBeLessThanOrEqual(5);
    if (data.length > 0) {
      expect(data[0]).toHaveProperty("product_name");
      expect(data[0]).toHaveProperty("revenue");
    }
  });

  it("ai_category_summary returns categories", async () => {
    const client = getClient();
    const { data, error } = await client.rpc("ai_category_summary", {
      p_branch_id: branchId,
      p_from: new Date(Date.now() - 86400000 * 30).toISOString(),
      p_to: new Date().toISOString(),
    });
    expect(error).toBeNull();
    if (data.length > 0) {
      expect(data[0]).toHaveProperty("category_name");
      expect(data[0]).toHaveProperty("revenue");
    }
  });

  it("ai_channel_summary returns channels", async () => {
    const client = getClient();
    const { data, error } = await client.rpc("ai_channel_summary", {
      p_branch_id: branchId,
      p_from: new Date(Date.now() - 86400000 * 30).toISOString(),
      p_to: new Date().toISOString(),
    });
    expect(error).toBeNull();
    if (data.length > 0) {
      expect(data[0]).toHaveProperty("channel_name");
      expect(data[0]).toHaveProperty("orders");
      expect(data[0]).toHaveProperty("revenue");
    }
  });

  it("ai_sales_timeseries returns time buckets", async () => {
    const client = getClient();
    const { data, error } = await client.rpc("ai_sales_timeseries", {
      p_branch_id: branchId,
      p_from: new Date(Date.now() - 86400000 * 30).toISOString(),
      p_to: new Date().toISOString(),
      p_granularity: "day",
    });
    expect(error).toBeNull();
    if (data.length > 0) {
      expect(data[0]).toHaveProperty("period_start");
      expect(data[0]).toHaveProperty("net_revenue");
    }
  });

  it("ai_period_comparison returns deltas", async () => {
    const client = getClient();
    const { data, error } = await client.rpc("ai_period_comparison", {
      p_branch_id: branchId,
      p_from: new Date(Date.now() - 86400000 * 7).toISOString(),
      p_to: new Date().toISOString(),
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0]).toHaveProperty("current_revenue");
    expect(data[0]).toHaveProperty("revenue_delta_percent");
  });

  it("ai_usage_summary returns run stats", async () => {
    const client = getClient();
    const { data, error } = await client.rpc("ai_usage_summary", {
      p_branch_id: branchId,
      p_from: new Date(Date.now() - 86400000 * 30).toISOString(),
      p_to: new Date().toISOString(),
    });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data[0]).toHaveProperty("total_runs");
    expect(data[0]).toHaveProperty("total_tokens");
  });

  it("unknown rpc returns empty array", async () => {
    const client = getClient();
    const { data, error } = await client.rpc("nonexistent_function", {});
    expect(error).toBeNull();
    expect(data).toHaveLength(0);
  });
});

// ── Auth ──

describe("MockQueryBuilder — auth", () => {
  it("getUser returns mock user", async () => {
    const client = getClient();
    const { data, error } = await client.auth.getUser();
    expect(error).toBeNull();
    expect(data.user.id).toBe(MOCK_USER_ID);
    expect(data.user.email).toBe("admin@demo.com");
  });

  it("signOut returns no error", async () => {
    const client = getClient();
    const { error } = await client.auth.signOut();
    expect(error).toBeNull();
  });

  it("signInWithPassword returns session", async () => {
    const client = getClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: "admin@demo.com",
      password: "password",
    });
    expect(error).toBeNull();
    expect(data.session.access_token).toBe("mock-token");
    expect(data.user.email).toBe("admin@demo.com");
  });
});

// ── Channel (Realtime mock) ──

describe("MockQueryBuilder — channel", () => {
  it("channel returns on/subscribe/unsubscribe methods", () => {
    const client = getClient();
    const ch = client.channel("test-channel");
    expect(typeof ch.on).toBe("function");
    expect(typeof ch.subscribe).toBe("function");
    expect(typeof ch.unsubscribe).toBe("function");
  });

  it("removeChannel resolves", async () => {
    const client = getClient();
    const ch = client.channel("test-channel");
    const { error } = await client.removeChannel(ch);
    expect(error).toBeNull();
  });
});

// ── Chained filters ──

describe("MockQueryBuilder — chained filters", () => {
  it("eq + eq narrows results", async () => {
    const client = getClient();
    const { data } = await client
      .from("products")
      .select("*")
      .eq("menu_type", "drink")
      .eq("is_active", true);
    expect(data!.every((r: any) => r.menu_type === "drink" && r.is_active === true)).toBe(true);
  });

  it("eq + gte + lte range", async () => {
    const client = getClient();
    const coffeeCatId = MOCK_CATEGORIES[0].id;
    const { data } = await client
      .from("products")
      .select("*")
      .eq("category_id", coffeeCatId)
      .gte("sale_price", 20000)
      .lte("sale_price", 30000);
    expect(data!.every((r: any) =>
      r.category_id === coffeeCatId &&
      r.sale_price >= 20000 && r.sale_price <= 30000
    )).toBe(true);
  });

  it("eq + order + limit chain", async () => {
    const client = getClient();
    const { data } = await client
      .from("products")
      .select("*")
      .eq("menu_type", "drink")
      .order("sale_price", { ascending: false })
      .limit(3);
    expect(data).toHaveLength(3);
    expect(data![0].sale_price).toBeGreaterThanOrEqual(data![1].sale_price);
    expect(data![1].sale_price).toBeGreaterThanOrEqual(data![2].sale_price);
  });
});
