import { describe, expect, it } from "vitest";
import { inferStepFromSession, percentFromAmount } from "@/lib/pos/session";

describe("inferStepFromSession", () => {
  const base = {
    orderType: "dine_in" as const,
    tableId: null,
    cart: [],
    customerPhone: "",
    customerName: "",
    discount: "0",
    tax: "0",
    serviceFee: "0",
  };

  it("returns service when empty", () => {
    expect(inferStepFromSession(base)).toBe("service");
  });

  it("returns items when dine_in with table selected", () => {
    expect(inferStepFromSession({ ...base, tableId: "t1" })).toBe("items");
  });

  it("returns items when cart has items", () => {
    expect(
      inferStepFromSession({
        ...base,
        tableId: "t1",
        cart: [{ productId: "p1", productName: "Cafe", unitPrice: 10000, quantity: 1, note: "", productType: "regular" }],
      })
    ).toBe("items");
  });

  it("returns checkout when customer phone present", () => {
    expect(
      inferStepFromSession({
        ...base,
        customerPhone: "0901234567",
      })
    ).toBe("checkout");
  });
});

describe("percentFromAmount", () => {
  it("computes percent from amount", () => {
    expect(percentFromAmount(100000, 10000)).toBe("10");
  });

  it("returns 0 for zero subtotal", () => {
    expect(percentFromAmount(0, 5000)).toBe("0");
  });
});
