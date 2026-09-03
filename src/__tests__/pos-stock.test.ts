import { describe, expect, it } from "vitest";
import { formatStockBadge, formatStockLabel, maxPreparedPortions, resolveProductStock } from "@/lib/pos/stock";

describe("maxPreparedPortions", () => {
  it("returns min portions from recipe without exposing ingredients in labels", () => {
    const stock = new Map([
      ["a", 10],
      ["b", 3],
    ]);
    const portions = maxPreparedPortions(
      [
        { inventory_item_id: "a", quantity: 2 },
        { inventory_item_id: "b", quantity: 1 },
      ],
      stock
    );
    expect(portions).toBe(3);
  });
});

describe("resolveProductStock", () => {
  const stockMap = new Map([["inv-1", 2]]);

  it("marks regular product out of stock by dish quantity", () => {
    const result = resolveProductStock({
      isActive: true,
      branchAvailable: true,
      productType: "regular",
      inventoryItemId: "inv-1",
      stockMap,
      recipeItems: [],
    });
    expect(result.available).toBe(true);
    expect(result.remainingQty).toBe(2);
  });

  it("marks prepared product unavailable when no portions left", () => {
    const result = resolveProductStock({
      isActive: true,
      branchAvailable: true,
      productType: "prepared",
      inventoryItemId: null,
      stockMap: new Map([["ing", 0]]),
      recipeItems: [{ inventory_item_id: "ing", quantity: 1 }],
    });
    expect(result.available).toBe(false);
    expect(result.stockReason).toBe("stock");
  });
});

describe("formatStockLabel", () => {
  it("shows dish name and shortage quantity only", () => {
    const label = formatStockLabel(
      "Bò lúc lắc",
      { available: false, remainingQty: 1, stockReason: "stock" },
      3
    );
    expect(label).toBe("Bò lúc lắc: thiếu 2 (còn 1)");
    expect(label).not.toContain("công thức");
  });
});

describe("formatStockBadge", () => {
  it("shows remaining count for out of stock dish", () => {
    expect(
      formatStockBadge({ available: false, remainingQty: 0, stockReason: "stock" })
    ).toBe("Không đủ (còn 0)");
  });
});
