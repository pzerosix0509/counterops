import { describe, it, expect } from "vitest";
import {
  calculateSubtotal,
  calculateCostOfGoods,
  calculateProfitTotals,
  calculateTotals,
  totalPaidAmount,
  classifyPaymentStatus,
  newOrderNumber,
} from "@/lib/calculations/orders";

describe("order calculations", () => {
  it("calculates subtotal from line items", () => {
    expect(
      calculateSubtotal([
        { productId: "p1", productName: "Cà phê sữa", unitPrice: 30000, costPrice: 8000, quantity: 2 },
        { productId: "p2", productName: "Nước suối", unitPrice: 10000, costPrice: 4000, quantity: 1 },
      ])
    ).toBe(70000);
  });

  it("applies discount, tax, and service fee to total", () => {
    const totals = calculateTotals(
      [
        { productId: "p1", productName: "Cà phê sữa", unitPrice: 30000, costPrice: 8000, quantity: 2 },
        { productId: "p2", productName: "Nước suối", unitPrice: 10000, costPrice: 4000, quantity: 1 },
      ],
      5000,
      3000,
      2000
    );
    expect(totals.subtotal).toBe(70000);
    expect(totals.totalAmount).toBe(70000 - 5000 + 3000 + 2000);
  });

  it("calculates cost of goods from line cost snapshots", () => {
    expect(
      calculateCostOfGoods([
        { costPrice: 12000, quantity: 2 },
        { costPrice: 4000, quantity: 1 },
      ])
    ).toBe(28000);
  });

  it("calculates profit and gross margin", () => {
    const profit = calculateProfitTotals(
      [
        { costPrice: 12000, quantity: 2 },
        { costPrice: 4000, quantity: 1 },
      ],
      70000
    );
    expect(profit.costOfGoods).toBe(28000);
    expect(profit.grossProfit).toBe(42000);
    expect(profit.grossMarginPercent).toBe(60);
  });

  it("never produces a negative total", () => {
    const totals = calculateTotals(
      [{ productId: "p1", productName: "X", unitPrice: 10000, costPrice: 0, quantity: 1 }],
      50000,
      0,
      0
    );
    expect(totals.totalAmount).toBe(0);
  });

  it("sums payment lines", () => {
    expect(
      totalPaidAmount([
        { method: "cash", amount: 20000 },
        { method: "bank_transfer", amount: 15000 },
      ])
    ).toBe(35000);
  });

  it("classifies payment status correctly", () => {
    expect(classifyPaymentStatus(50000, 0)).toBe("open");
    expect(classifyPaymentStatus(50000, 20000)).toBe("partially_paid");
    expect(classifyPaymentStatus(50000, 50000)).toBe("paid");
    expect(classifyPaymentStatus(50000, 70000)).toBe("paid");
  });

  it("generates a unique order number with branch sequence", () => {
    const date = new Date("2026-06-19T10:00:00Z");
    expect(newOrderNumber(7, date)).toMatch(/^DH-20260619-0007$/);
  });
});
