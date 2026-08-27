import { describe, it, expect } from "vitest";
import { flagsFromItemType, generateSkuCode, inferCategoryMenuType, itemTypeFromFlags, normalizeItemName } from "@/lib/inventory/sku";
import { computeBomCost } from "@/lib/calculations/inventory";

describe("sku helpers", () => {
  it("normalizes names and generates a code without user input", () => {
    expect(normalizeItemName("  Sữa  đặc ")).toBe("Sữa đặc");
    const code = generateSkuCode("Sữa đặc");
    expect(code.startsWith("SUA-DAC-") || code.includes("SUA")).toBe(true);
    expect(code.length).toBeGreaterThan(8);
  });

  it("maps exclusive item types to flags and back", () => {
    expect(flagsFromItemType("sellable_product")).toEqual({ canBeIngredient: false, canBeSold: true });
    expect(itemTypeFromFlags(true, false)).toBe("ingredient");
    expect(itemTypeFromFlags(false, true)).toBe("sellable_product");
    expect(itemTypeFromFlags(true, true)).toBe("other");
  });

  it("infers category menu type from Vietnamese names", () => {
    expect(inferCategoryMenuType("Cà phê")).toBe("drink");
    expect(inferCategoryMenuType("Chiên")).toBe("food");
    expect(inferCategoryMenuType("Dịch vụ")).toBe("service");
  });
});

describe("BOM cost", () => {
  it("sums quantity times unit cost and rounds", () => {
    expect(computeBomCost([
      { quantity: 20, unitCost: 5 },
      { quantity: 30, unitCost: 2 },
    ])).toBe(160);
    expect(computeBomCost([{ quantity: 0.2, unitCost: 22000 }])).toBe(4400);
  });
});
