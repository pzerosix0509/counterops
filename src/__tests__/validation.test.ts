import { describe, it, expect } from "vitest";
import { onboardingSchema, productSchema, orderInputSchema, paymentInputSchema } from "@/lib/validation/schemas";

describe("validation schemas", () => {
  it("accepts a valid onboarding payload", () => {
    const r = onboardingSchema.safeParse({
      organizationName: "Quán Cafe Demo",
      organizationSlug: "cafe-demo",
      businessType: "restaurant",
      branchName: "Chi nhánh 1",
      branchAddress: "123 Lê Lợi",
      branchPhone: "0900000000",
    });
    expect(r.success).toBe(true);
  });

  it("rejects bad slug", () => {
    const r = onboardingSchema.safeParse({
      organizationName: "X",
      organizationSlug: "Bad Slug!",
      branchName: "B",
    });
    expect(r.success).toBe(false);
  });

  it("requires product name and code", () => {
    const r = productSchema.safeParse({
      name: "",
      code: "",
      menuType: "food",
      productType: "regular",
      costPrice: -1,
      salePrice: 0,
      unit: "phần",
      isActive: true,
    });
    expect(r.success).toBe(false);
  });

  it("requires at least one order item", () => {
    const r = orderInputSchema.safeParse({
      branchId: "00000000-0000-0000-0000-000000000000",
      orderType: "dine_in",
      items: [],
      discountAmount: 0,
      taxAmount: 0,
      serviceFeeAmount: 0,
    });
    expect(r.success).toBe(false);
  });

  it("requires at least one payment", () => {
    const r = paymentInputSchema.safeParse({
      orderId: "00000000-0000-0000-0000-000000000000",
      payments: [],
    });
    expect(r.success).toBe(false);
  });
});
