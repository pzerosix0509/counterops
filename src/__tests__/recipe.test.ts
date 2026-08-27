import { describe, it, expect } from "vitest";
import { recipeItemInputSchema } from "@/lib/validation/schemas";
import { computeRecipeCost } from "@/lib/calculations/inventory";

const UUID = "123e4567-e89b-12d3-a456-426614174000";

describe("recipe item input validation", () => {
  it("accepts a valid recipe item", () => {
    const res = recipeItemInputSchema.safeParse({
      inventoryItemId: UUID,
      quantity: 2.5,
      unit: "g",
    });
    expect(res.success).toBe(true);
  });

  it("rejects zero or negative quantity", () => {
    expect(
      recipeItemInputSchema.safeParse({
        inventoryItemId: UUID,
        quantity: 0,
        unit: "g",
      }).success
    ).toBe(false);
    expect(
      recipeItemInputSchema.safeParse({
        inventoryItemId: UUID,
        quantity: -3,
        unit: "g",
      }).success
    ).toBe(false);
  });

  it("rejects empty unit and invalid inventory item id", () => {
    expect(
      recipeItemInputSchema.safeParse({
        inventoryItemId: UUID,
        quantity: 1,
        unit: "",
      }).success
    ).toBe(false);
    expect(
      recipeItemInputSchema.safeParse({
        inventoryItemId: "not-a-uuid",
        quantity: 1,
        unit: "g",
      }).success
    ).toBe(false);
  });
});

describe("recipe cost calculation", () => {
  it("computes total cost from quantity x cost per unit", () => {
    // Mô phỏng cách action tính: estimatedCost (giá 1 đơn vị) = cost_price,
    // computeRecipeCost nhân với quantity.
    const costByItem: Record<string, number> = {
      i1: 5000,
      i2: 2000,
    };
    const items = [
      { inventoryItemId: "i1", quantity: 2, unit: "g" },
      { inventoryItemId: "i2", quantity: 3, unit: "ml" },
    ];
    const recipeItems = items.map((r) => ({
      quantity: r.quantity,
      estimatedCost: costByItem[r.inventoryItemId],
    }));
    expect(computeRecipeCost(recipeItems)).toBe(5000 * 2 + 2000 * 3);
  });

  it("returns 0 for empty recipe", () => {
    expect(computeRecipeCost([])).toBe(0);
  });
});
