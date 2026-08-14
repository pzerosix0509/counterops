import { describe, expect, it } from "vitest";
import { explodeBom, purchaseHint } from "@/lib/analytics/demand";

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

describe("purchaseHint", () => {
  it("suggests the gap after safety stock", () => {
    expect(purchaseHint(20, 5, 2)).toBe(17);
    expect(purchaseHint(10, 12, 0)).toBe(0);
  });
});
