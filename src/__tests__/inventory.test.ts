import { describe, it, expect } from "vitest";
import {
  findShortages,
  computeRecipeCost,
  expectedNetProfit,
} from "@/lib/calculations/inventory";

describe("inventory calculations", () => {
  it("finds shortages when available < needed", () => {
    const shortages = findShortages([
      { inventoryItemId: "i1", quantityAvailable: 5, quantityNeeded: 10 },
      { inventoryItemId: "i2", quantityAvailable: 8, quantityNeeded: 8 },
    ]);
    expect(shortages).toEqual([{ inventoryItemId: "i1", shortage: 5 }]);
  });

  it("handles empty input", () => {
    expect(findShortages([])).toEqual([]);
  });

  it("computes recipe total cost", () => {
    expect(
      computeRecipeCost([
        { quantity: 20, estimatedCost: 5 },
        { quantity: 30, estimatedCost: 2 },
      ])
    ).toBe(20 * 5 + 30 * 2);
  });

  it("computes expected net profit", () => {
    expect(expectedNetProfit(30000, 12000)).toBe(18000);
    expect(expectedNetProfit(0, 5000)).toBe(-5000);
  });
});
