import { describe, it, expect } from "vitest";
import {
  MOCK_ORG_ID,
  MOCK_BRANCH_ID,
  MOCK_USER_ID,
  MOCK_CATEGORIES,
  MOCK_AREAS,
  MOCK_TABLES,
  MOCK_INVENTORY_ITEMS,
  MOCK_ORDERS,
  MOCK_RECIPES,
} from "@/lib/mock/data";

import { listCategories } from "@/server/queries/menu";
import { listProducts, getProductWithRecipe } from "@/server/queries/menu";
import { listProductsForPos, listSalesChannels, getOrderWithItems } from "@/server/queries/orders";
import { listKitchenItems } from "@/server/queries/kitchen";
import { listAreas, listTables } from "@/server/queries/tables";
import { listInventoryItems, listInventoryBalances, listInventoryMovements } from "@/server/queries/inventory";
import { listAiChatSessions, listAiChatMessages } from "@/server/ai/conversations";
import { getActiveBranchId } from "@/lib/auth/permissions";
import { mockCookieStore } from "./mock-server-setup";

// ── Menu queries ──

describe("Query — listCategories", () => {
  it("returns categories sorted by sort_order", async () => {
    const result = await listCategories(MOCK_ORG_ID);
    expect(result.length).toBe(MOCK_CATEGORIES.length);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].sort_order).toBeGreaterThanOrEqual(result[i - 1].sort_order);
    }
  });
});

describe("Query — listProducts", () => {
  it("returns non-deleted products sorted by name", async () => {
    const result = await listProducts(MOCK_ORG_ID);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p) => p.deleted_at == null)).toBe(true);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].name.localeCompare(result[i - 1].name)).toBeGreaterThanOrEqual(0);
    }
  });

  it("filters by search term (ilike)", async () => {
    const result = await listProducts(MOCK_ORG_ID, { search: "Cà phê" });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p) => p.name.toLowerCase().includes("cà phê"))).toBe(true);
  });

  it("filters by categoryId", async () => {
    const coffeeCatId = MOCK_CATEGORIES[0].id;
    const result = await listProducts(MOCK_ORG_ID, { categoryId: coffeeCatId });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p) => p.category_id === coffeeCatId)).toBe(true);
  });

  it("filters by isActive", async () => {
    const result = await listProducts(MOCK_ORG_ID, { isActive: false });
    expect(result.every((p) => p.is_active === false)).toBe(true);
  });
});

describe("Query — getProductWithRecipe", () => {
  it("returns product with recipe for a product that has one", async () => {
    const productWithRecipe = MOCK_RECIPES[0].product_id;
    const result = await getProductWithRecipe(MOCK_ORG_ID, productWithRecipe);
    expect(result).not.toBeNull();
    expect(result!.product).toBeDefined();
    expect(result!.recipe).toBeDefined();
    expect(result!.recipe!.recipe_items).toBeDefined();
    expect(result!.recipe!.recipe_items.length).toBeGreaterThan(0);
  });

  it("returns null for nonexistent product", async () => {
    const result = await getProductWithRecipe(MOCK_ORG_ID, "00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});

// ── Orders queries ──

describe("Query — listSalesChannels", () => {
  it("returns active channels for org", async () => {
    const result = await listSalesChannels(MOCK_ORG_ID);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((ch) => ch.organization_id === MOCK_ORG_ID)).toBe(true);
    expect(result.every((ch) => ch.is_active === true)).toBe(true);
  });
});

describe("Query — listProductsForPos", () => {
  it("returns active non-deleted products with available flag", async () => {
    const result = await listProductsForPos(MOCK_ORG_ID, MOCK_BRANCH_ID);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((p) => {
      expect(p).toHaveProperty("available");
      expect(typeof p.available).toBe("boolean");
    });
  });
});

describe("Query — getOrderWithItems", () => {
  it("returns order with items and payments", async () => {
    const orderId = MOCK_ORDERS[0].id;
    const result = await getOrderWithItems(MOCK_ORG_ID, orderId);
    expect(result).not.toBeNull();
    expect(result!.id).toBe(orderId);
    expect(result!.items).toBeDefined();
    expect(result!.payments).toBeDefined();
  });

  it("returns null for nonexistent order", async () => {
    const result = await getOrderWithItems(MOCK_ORG_ID, "00000000-0000-0000-0000-000000000000");
    expect(result).toBeNull();
  });
});

// ── Kitchen ──

describe("Query — listKitchenItems", () => {
  it("returns items with nested order data", async () => {
    // "served" items belong to paid orders (o1, o2), so the filter passes
    const result = await listKitchenItems(MOCK_BRANCH_ID, ["served"]);
    expect(result.length).toBeGreaterThan(0);
    result.forEach((ki) => {
      expect(ki.item).toBeDefined();
      expect(ki.orderNumber).toBeDefined();
      expect(ki.item.kitchen_status).toBe("served");
      expect(ki.orderType).toBeDefined();
    });
  });

  it("returns empty array when no items match statuses", async () => {
    const result = await listKitchenItems(MOCK_BRANCH_ID, ["cancelled"]);
    expect(result).toHaveLength(0);
  });
});

// ── Tables ──

describe("Query — listAreas", () => {
  it("returns areas for branch", async () => {
    const result = await listAreas(MOCK_BRANCH_ID);
    expect(result.length).toBe(MOCK_AREAS.length);
  });
});

describe("Query — listTables", () => {
  it("returns tables for branch", async () => {
    const result = await listTables(MOCK_BRANCH_ID);
    expect(result.length).toBe(MOCK_TABLES.length);
  });
});

// ── Inventory ──

describe("Query — listInventoryItems", () => {
  it("returns inventory items for org", async () => {
    const result = await listInventoryItems(MOCK_ORG_ID);
    expect(result.length).toBe(MOCK_INVENTORY_ITEMS.length);
  });
});

describe("Query — listInventoryBalances", () => {
  it("returns balances for branch", async () => {
    const result = await listInventoryBalances(MOCK_ORG_ID, MOCK_BRANCH_ID);
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("Query — listInventoryMovements", () => {
  it("returns movements for a specific item", async () => {
    const itemId = MOCK_INVENTORY_ITEMS[0].id;
    const result = await listInventoryMovements(MOCK_BRANCH_ID, itemId, 50);
    expect(Array.isArray(result)).toBe(true);
  });
});

// ── AI conversations ──

describe("Query — listAiChatSessions", () => {
  it("returns empty array initially (no seed sessions)", async () => {
    const result = await listAiChatSessions(MOCK_ORG_ID, MOCK_BRANCH_ID, MOCK_USER_ID);
    expect(result).toHaveLength(0);
  });
});

describe("Query — listAiChatMessages", () => {
  it("returns empty array for nonexistent session", async () => {
    const result = await listAiChatMessages("00000000-0000-0000-0000-000000000000");
    expect(result).toHaveLength(0);
  });
});

// ── Cookie-based branch resolution ──

describe("Query — getActiveBranchId with active_branch cookie", () => {
  it("returns branch matching the active_branch cookie", async () => {
    // Insert a second branch for the same org
    const { createMockServerClient } = await import("@/lib/mock/supabase");
    const client = createMockServerClient();
    const secondBranch = {
      id: "00000002-0000-4000-a000-000000000099",
      organization_id: MOCK_ORG_ID,
      name: "Chi nhánh cookie test",
      address: null,
      phone: null,
      timezone: "Asia/Ho_Chi_Minh",
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await client.from("branches").insert(secondBranch);

    // Insert a branch-scoped membership for the second branch
    await client.from("memberships").insert({
      id: "00000000-0000-4000-a000-000000000099",
      organization_id: MOCK_ORG_ID,
      branch_id: secondBranch.id,
      user_id: MOCK_USER_ID,
      role: "cashier",
      status: "active",
      invited_by: MOCK_USER_ID,
      joined_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    // Seed the cookie
    mockCookieStore.set("active_branch", secondBranch.id);

    // getActiveBranchId should return the cookie branch
    const result = await getActiveBranchId(MOCK_ORG_ID);
    expect(result).toBe(secondBranch.id);
  });
});
