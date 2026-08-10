import { describe, expect, it } from "vitest";
import { AI_GOLDEN_QUESTIONS, evaluateGoldenQuestions } from "@/lib/ai/golden-questions";
import { aiDashboardSpecSchema } from "@/lib/ai/schemas";
import { planAnalyticsTools } from "@/lib/ai/semantic-layer";
import { buildChartForQuestion, buildDashboardSpec } from "@/server/ai/analytics";
import type { AiAnalyticsContext } from "@/types/ai";

describe("AI analytics golden questions", () => {
  it("routes every golden question to the expected governed tools", () => {
    const result = evaluateGoldenQuestions(new Date("2026-07-01T12:00:00+07:00"));
    expect(result.total).toBe(AI_GOLDEN_QUESTIONS.length);
    expect(result.cases.filter((item) => !item.passed)).toEqual([]);
    expect(result.accuracy).toBe(1);
  });

  it("inherits the previous date range for a follow-up question", () => {
    const plan = planAnalyticsTools(
      "Còn món nào lãi thấp?",
      "chat",
      new Date("2026-07-01T12:00:00+07:00"),
      ["Phân tích doanh thu tháng trước"],
    );
    expect(plan[0]?.arguments.rangeLabel).toBe("Tháng trước");
    expect(plan.map((call) => call.name)).toContain("top_products");
  });
});

describe("AI chart keyword normalization", () => {
  const analytics: AiAnalyticsContext = {
    range: { from: "2026-06-25T00:00:00.000Z", to: "2026-07-01T23:59:59.999Z", label: "7 ngày qua" },
    salesSummary: null,
    topProducts: [{ product_name: "Cà phê sữa", quantity: 10, revenue: 300_000, cost_of_goods: 100_000, gross_profit: 200_000 }],
    channelSummary: [{ channel_name: "Tại quán", orders: 10, revenue: 1_000_000, channel_fees: 0 }],
    salesTimeseries: [{
      period_start: "2026-07-01T00:00:00.000Z",
      total_orders: 10,
      net_revenue: 1_000_000,
      cost_of_goods: 400_000,
      gross_profit: 600_000,
      channel_fees: 20_000,
      net_profit: 580_000,
    }],
    categorySummary: [{
      category_id: "1b10da4c-7dc7-4522-89f0-0e895dedce94",
      category_name: "Cà phê",
      quantity: 10,
      revenue: 300_000,
      cost_of_goods: 100_000,
      gross_profit: 200_000,
    }],
    periodComparison: null,
    forecastRevenue: null,
  };

  it("matches Vietnamese keywords with diacritics for charts", () => {
    expect(buildChartForQuestion("Vẽ biểu đồ doanh thu 7 ngày qua", analytics)?.type).toBe("composed");
    expect(buildChartForQuestion("Doanh thu theo nhóm món tháng này", analytics)?.type).toBe("donut");
    expect(buildChartForQuestion("Doanh thu kênh bán hôm nay", analytics)?.type).toBe("bar");
    expect(buildChartForQuestion("Top món bán chạy nhất", analytics)?.type).toBe("composed");
  });
});

describe("strict AI dashboard schema", () => {
  const analytics: AiAnalyticsContext = {
    range: {
      from: "2026-06-25T00:00:00.000Z",
      to: "2026-07-01T23:59:59.999Z",
      label: "7 ngày qua",
    },
    salesSummary: {
      total_orders: 10,
      net_revenue: 1_000_000,
      cost_of_goods: 400_000,
      gross_profit: 600_000,
      channel_fees: 20_000,
      net_profit: 580_000,
    },
    topProducts: [{
      product_name: "Cà phê sữa",
      quantity: 10,
      revenue: 300_000,
      cost_of_goods: 100_000,
      gross_profit: 200_000,
    }],
    channelSummary: [{
      channel_name: "Tại quán",
      orders: 10,
      revenue: 1_000_000,
      channel_fees: 0,
    }],
    salesTimeseries: [{
      period_start: "2026-07-01T00:00:00.000Z",
      total_orders: 10,
      net_revenue: 1_000_000,
      cost_of_goods: 400_000,
      gross_profit: 600_000,
      channel_fees: 20_000,
      net_profit: 580_000,
    }],
    categorySummary: [{
      category_id: "1b10da4c-7dc7-4522-89f0-0e895dedce94",
      category_name: "Cà phê",
      quantity: 10,
      revenue: 300_000,
      cost_of_goods: 100_000,
      gross_profit: 200_000,
    }],
    periodComparison: {
      current_orders: 10,
      previous_orders: 8,
      orders_delta_percent: 25,
      current_revenue: 1_000_000,
      previous_revenue: 800_000,
      revenue_delta_percent: 25,
      current_profit: 580_000,
      previous_profit: 400_000,
      profit_delta_percent: 45,
    },
    forecastRevenue: null,
  };

  it("accepts the deterministic dashboard generated from governed metrics", () => {
    expect(aiDashboardSpecSchema.safeParse(buildDashboardSpec(analytics)).success).toBe(true);
  });

  it("rejects unsupported chart types and unknown fields", () => {
    const dashboard = buildDashboardSpec(analytics);
    expect(aiDashboardSpecSchema.safeParse({
      ...dashboard,
      charts: [{ ...dashboard.charts[0], type: "html", rawHtml: "<script />" }],
    }).success).toBe(false);
  });
});
