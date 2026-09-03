import { describe, it, expect } from "vitest";
import {
  loginSchema,
  productSchema,
  inventoryItemSchema,
  inventoryItemUpdateSchema,
} from "@/lib/validation/schemas";

describe("login — loginSchema", () => {
  it("accepts valid login input", () => {
    const result = loginSchema.safeParse({
      email: "user@counterops.local",
      password: "TestLoop123!",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@counterops.local");
      expect(result.data.password).toBe("TestLoop123!");
    }
  });

  it("rejects invalid login input", () => {
    const emptyEmail = loginSchema.safeParse({ email: "", password: "secret12" });
    expect(emptyEmail.success).toBe(false);

    const badEmail = loginSchema.safeParse({ email: "not-an-email", password: "secret12" });
    expect(badEmail.success).toBe(false);

    const shortPassword = loginSchema.safeParse({
      email: "user@counterops.local",
      password: "12345",
    });
    expect(shortPassword.success).toBe(false);
  });
});

describe("menu — productSchema", () => {
  it("accepts product without code or menuType", () => {
    const result = productSchema.safeParse({
      name: "Cà phê sữa",
      productType: "regular",
      salePrice: 35000,
      unit: "ly",
      isActive: true,
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid product input", () => {
    const missingName = productSchema.safeParse({
      name: "",
      productType: "regular",
      salePrice: 35000,
      unit: "ly",
      isActive: true,
    });
    expect(missingName.success).toBe(false);

    const negativePrice = productSchema.safeParse({
      name: "Cà phê sữa",
      productType: "regular",
      costPrice: -100,
      salePrice: 35000,
      unit: "ly",
      isActive: true,
    });
    expect(negativePrice.success).toBe(false);
  });
});

describe("inventory — inventoryItemSchema", () => {
  it("accepts unique name without code", () => {
    const result = inventoryItemSchema.safeParse({
      name: "Sữa tươi",
      canBeIngredient: true,
      canBeSold: false,
      unit: "ml",
      costPrice: 50,
      initialQuantity: 10000,
      lowStockThreshold: 500,
    });
    expect(result.success).toBe(true);
  });

  it("accepts menuType for sellable items without a group", () => {
    const result = inventoryItemSchema.safeParse({
      name: "Nước suối",
      canBeIngredient: false,
      canBeSold: true,
      salePrice: 10000,
      menuType: "drink",
      categoryId: null,
      unit: "chai",
      costPrice: 5000,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.menuType).toBe("drink");
  });

  it("rejects missing name and neither flag", () => {
    const missingName = inventoryItemSchema.safeParse({
      name: "",
      canBeIngredient: true,
      unit: "ml",
      costPrice: 50,
    });
    expect(missingName.success).toBe(false);

    const noRole = inventoryItemSchema.safeParse({
      name: "Sữa tươi",
      canBeIngredient: false,
      canBeSold: false,
      unit: "ml",
      costPrice: 50,
    });
    expect(noRole.success).toBe(false);

    const negativeCost = inventoryItemSchema.safeParse({
      name: "Sữa tươi",
      canBeIngredient: true,
      unit: "ml",
      costPrice: -1,
    });
    expect(negativeCost.success).toBe(false);
  });
});

describe("inventory — inventoryItemUpdateSchema", () => {
  it("requires id and omits initialQuantity", () => {
    const result = inventoryItemUpdateSchema.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Sữa tươi",
      canBeIngredient: true,
      canBeSold: false,
      unit: "ml",
      costPrice: 50,
      lowStockThreshold: 10,
    });
    expect(result.success).toBe(true);
  });
});
