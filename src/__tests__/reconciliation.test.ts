import { describe, expect, it } from "vitest";
import { isPartialPeriod, reconcileAnalytics } from "@/lib/ai/reconciliation";
import type { AiAnalyticsContext } from "@/types/ai";

function baseContext(overrides?: Partial<AiAnalyticsContext>): AiAnalyticsContext {
  return {
    range: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-07T23:59:59.999Z", label: "7 ngày qua" },
    salesSummary: {
      total_orders: 10,
      net_revenue: 1_000_000,
      cost_of_goods: 400_000,
      gross_profit: 600_000,
      channel_fees: 20_000,
      net_profit: 580_000,
    },
    topProducts: [{ product_name: "Cà phê sữa", quantity: 10, revenue: 1_000_000, cost_of_goods: 400_000, gross_profit: 600_000 }],
    channelSummary: [{ channel_name: "Tại quán", orders: 10, revenue: 1_000_000, channel_fees: 0 }],
    salesTimeseries: [],
    categorySummary: [],
    periodComparison: null,
    forecastRevenue: null,
    ...overrides,
  };
}

describe("reconciliation", () => {
  it("passes when summary matches timeseries sum", () => {
    const ctx = baseContext({
      salesTimeseries: [{
        period_start: "2026-07-01T00:00:00.000Z",
        total_orders: 6,
        net_revenue: 600_000,
        cost_of_goods: 200_000,
        gross_profit: 400_000,
        channel_fees: 10_000,
        net_profit: 390_000,
      }, {
        period_start: "2026-07-02T00:00:00.000Z",
        total_orders: 4,
        net_revenue: 400_000,
        cost_of_goods: 200_000,
        gross_profit: 200_000,
        channel_fees: 10_000,
        net_profit: 190_000,
      }],
    });
    const result = reconcileAnalytics(ctx);
    expect(result.passed).toBe(true);
  });

  it("flags summary vs timeseries mismatch", () => {
    const ctx = baseContext({
      salesTimeseries: [{
        period_start: "2026-07-01T00:00:00.000Z",
        total_orders: 10,
        net_revenue: 800_000, // khác summary 1.000.000
        cost_of_goods: 400_000,
        gross_profit: 400_000,
        channel_fees: 20_000,
        net_profit: 380_000,
      }],
    });
    const result = reconcileAnalytics(ctx);
    expect(result.issues.some((issue) => issue.code === "summary_timeseries_mismatch")).toBe(true);
    expect(result.passed).toBe(false);
  });

  it("flags breakdown exceeding total", () => {
    const ctx = baseContext({
      topProducts: [{ product_name: "Cà phê sữa", quantity: 10, revenue: 1_500_000, cost_of_goods: 400_000, gross_profit: 1_100_000 }],
    });
    const result = reconcileAnalytics(ctx);
    expect(result.issues.some((issue) => issue.code === "breakdown_exceeds_total")).toBe(true);
  });

  it("flags empty previous period when current has orders", () => {
    const ctx = baseContext({
      periodComparison: {
        current_orders: 10,
        previous_orders: 0,
        orders_delta_percent: null,
        current_revenue: 1_000_000,
        previous_revenue: 0,
        revenue_delta_percent: null,
        current_profit: 580_000,
        previous_profit: 0,
        profit_delta_percent: null,
      },
    });
    const result = reconcileAnalytics(ctx);
    expect(result.issues.some((issue) => issue.code === "empty_previous_period")).toBe(true);
  });

  it("flags partial period for this month with to near now", () => {
    const now = new Date("2026-07-10T12:00:00Z");
    const ctx = baseContext({
      range: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-10T11:59:59.999Z", label: "Tháng này" },
    });
    expect(isPartialPeriod(ctx.range, now)).toBe(true);
    const result = reconcileAnalytics(ctx, now);
    expect(result.issues.some((issue) => issue.code === "partial_period")).toBe(true);
  });

  it("does not flag partial period for a completed past range", () => {
    const now = new Date("2026-07-10T12:00:00Z");
    const ctx = baseContext({
      range: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-07T23:59:59.999Z", label: "7 ngày qua" },
    });
    expect(isPartialPeriod(ctx.range, now)).toBe(false);
  });
});
