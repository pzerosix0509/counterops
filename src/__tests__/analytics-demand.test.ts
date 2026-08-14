import { describe, expect, it } from "vitest";
import { explodeBom, pickLatestRecipeVersion, purchaseHint } from "@/lib/analytics/demand";

describe("explodeBom", () => {
  it("converts 100 steaks to 20kg beef", () => {
    const ingredients = explodeBom(
      [{ productId: "steak", qty: 100 }],
      [{ productId: "steak", inventoryItemId: "beef", quantityPerDish: 0.2, unit: "kg" }],
    );
    expect(ingredients).toEqual([
      { inventoryItemId: "beef", qty: 20, unit: "kg" },
    ]);
  });
});

describe("pickLatestRecipeVersion", () => {
  it("keeps only the max version per product among active recipes", () => {
    const latest = pickLatestRecipeVersion([
      { product_id: "steak", version: 1, qty: 0.1 },
      { product_id: "steak", version: 3, qty: 0.2 },
      { product_id: "steak", version: 2, qty: 0.15 },
      { product_id: "soup", version: 1, qty: 0.05 },
    ]);
    expect(latest).toEqual([
      { product_id: "steak", version: 3, qty: 0.2 },
      { product_id: "soup", version: 1, qty: 0.05 },
    ]);
  });
});

describe("purchaseHint", () => {
  it("suggests the gap after safety stock", () => {
    expect(purchaseHint(20, 5, 2)).toBe(17);
    expect(purchaseHint(10, 12, 0)).toBe(0);
  });
});
