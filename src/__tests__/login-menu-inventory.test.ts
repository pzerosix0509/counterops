import { describe, it, expect } from "vitest";
import {
  loginSchema,
  productSchema,
  inventoryItemSchema,
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
  it("accepts valid product input", () => {
    const result = productSchema.safeParse({
      name: "Cà phê sữa",
      code: "CF-SUA",
      menuType: "drink",
      productType: "regular",
      costPrice: 15000,
      salePrice: 35000,
      unit: "ly",
      isActive: true,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Cà phê sữa");
      expect(result.data.salePrice).toBe(35000);
    }
  });

  it("rejects invalid product input", () => {
    const missingName = productSchema.safeParse({
      name: "",
      code: "CF-SUA",
      menuType: "drink",
      productType: "regular",
      costPrice: 15000,
      salePrice: 35000,
      unit: "ly",
      isActive: true,
    });
    expect(missingName.success).toBe(false);

    const negativePrice = productSchema.safeParse({
      name: "Cà phê sữa",
      code: "CF-SUA",
      menuType: "drink",
      productType: "regular",
      costPrice: -100,
      salePrice: 35000,
      unit: "ly",
      isActive: true,
    });
    expect(negativePrice.success).toBe(false);

    const badMenuType = productSchema.safeParse({
      name: "Cà phê sữa",
      code: "CF-SUA",
      menuType: "beverage",
      productType: "regular",
      costPrice: 15000,
      salePrice: 35000,
      unit: "ly",
      isActive: true,
    });
    expect(badMenuType.success).toBe(false);
  });
});

describe("inventory — inventoryItemSchema", () => {
  it("accepts valid inventory item input", () => {
    const result = inventoryItemSchema.safeParse({
      name: "Sữa tươi",
      code: "NV-SUA",
      itemType: "ingredient",
      unit: "ml",
      costPrice: 50,
      initialQuantity: 10000,
      lowStockThreshold: 500,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Sữa tươi");
      expect(result.data.itemType).toBe("ingredient");
    }
  });

  it("rejects invalid inventory item input", () => {
    const missingCode = inventoryItemSchema.safeParse({
      name: "Sữa tươi",
      code: "",
      itemType: "ingredient",
      unit: "ml",
      costPrice: 50,
    });
    expect(missingCode.success).toBe(false);

    const negativeCost = inventoryItemSchema.safeParse({
      name: "Sữa tươi",
      code: "NV-SUA",
      itemType: "ingredient",
      unit: "ml",
      costPrice: -1,
    });
    expect(negativeCost.success).toBe(false);

    const badItemType = inventoryItemSchema.safeParse({
      name: "Sữa tươi",
      code: "NV-SUA",
      itemType: "raw_material",
      unit: "ml",
      costPrice: 50,
    });
    expect(badItemType.success).toBe(false);
  });
});
