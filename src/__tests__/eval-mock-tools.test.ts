import { describe, expect, it } from "vitest";
import { EVAL_DATASET, scenarioDays } from "@/lib/ai/eval/synthetic-data";
import { mockExecuteAiToolPlan } from "@/lib/ai/eval/mock-tools";
import type { AiToolCall } from "@/types/ai";

function call(name: AiToolCall["name"], arguments_: Record<string, string | number | boolean | null> = {}): AiToolCall {
  return { id: `t-${name}`, name, arguments: arguments_ };
}

describe("synthetic dataset", () => {
  it("has 35 days ending on an incomplete current period", () => {
    expect(EVAL_DATASET.days).toHaveLength(35);
    const last = EVAL_DATASET.days.at(-1)!;
    expect(last.date).toBe("2026-08-04");
    // "Hôm nay" chưa hoàn tất: doanh thu thấp hơn ngày thường
    const normal = EVAL_DATASET.days[0]!;
    expect(last.revenue).toBeLessThan(normal.revenue);
  });

  it("computes expected totals consistent with days", () => {
    const manualRevenue = EVAL_DATASET.days.reduce((sum, d) => sum + d.revenue, 0);
    expect(EVAL_DATASET.expected.totalRevenue).toBe(manualRevenue);
    expect(EVAL_DATASET.expected.totalOrders).toBe(EVAL_DATASET.days.reduce((sum, d) => sum + d.orders, 0));
  });

  it("top product/channel come from aggregated fixture", () => {
    expect(EVAL_DATASET.expected.topProduct).toBe("Espresso");
    expect(EVAL_DATASET.expected.worstProduct).toBe("Matcha");
    expect(EVAL_DATASET.expected.topChannel).toBe("Shopee");
  });

  it("scenarios mutate data as expected", () => {
    expect(scenarioDays("missing-day")).toHaveLength(34);
    expect(scenarioDays("duplicate-day")).toHaveLength(36);
    expect(scenarioDays("empty-period")).toHaveLength(1);
    expect(scenarioDays("small-sample")).toHaveLength(3);
    // refund-day: ngày 2026-07-20 có refunds
    const refund = scenarioDays("refund-day").find((d) => d.date === "2026-07-20")!;
    expect(refund.refunds).toBeGreaterThan(0);
  });
});

describe("mock tools", () => {
  const rangeArgs = {
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-08-04T23:59:59.999Z",
    rangeLabel: "35 ngày qua",
    timezone: "Asia/Ho_Chi_Minh",
  };

  it("sales_summary matches expected totals", async () => {
    const executions = await mockExecuteAiToolPlan([call("sales_summary", rangeArgs)]);
    const row = executions[0]!.rows[0] as Record<string, number>;
    expect(row.net_revenue).toBe(EVAL_DATASET.expected.totalRevenue);
    expect(row.total_orders).toBe(EVAL_DATASET.expected.totalOrders);
    expect(row.net_profit).toBe(EVAL_DATASET.expected.totalProfit);
  });

  it("top_products returns fixture order with correct top", async () => {
    const executions = await mockExecuteAiToolPlan([call("top_products", { ...rangeArgs, limit: 10 })]);
    const rows = executions[0]!.rows as Array<Record<string, unknown>>;
    expect(rows[0]?.product_name).toBe("Espresso");
    expect(rows.at(-1)?.product_name).toBe("Matcha");
  });

  it("channel_summary returns Shopee as top channel", async () => {
    const executions = await mockExecuteAiToolPlan([call("channel_summary", rangeArgs)]);
    const rows = executions[0]!.rows as Array<Record<string, unknown>>;
    const top = [...rows].sort((a, b) => Number(b.revenue) - Number(a.revenue))[0];
    expect(top?.channel_name).toBe("Shopee");
  });

  it("period_comparison computes deltas against previous equal-length period", async () => {
    // Current 7 ngày: 2026-07-29..08-04 (trong fixture); previous = 2026-07-22..28
    const executions = await mockExecuteAiToolPlan([call("period_comparison", {
      from: "2026-07-29T00:00:00.000Z",
      to: "2026-08-04T23:59:59.999Z",
      rangeLabel: "7 ngày qua",
      timezone: "Asia/Ho_Chi_Minh",
    })]);
    const row = executions[0]!.rows[0] as Record<string, number>;
    expect(row.current_revenue).toBeGreaterThan(0);
    expect(row.previous_revenue).toBeGreaterThan(0);
    expect(row.revenue_delta_percent).not.toBeNull();
    expect(typeof row.revenue_delta_percent).toBe("number");
  });

  it("forecast_revenue returns a forecast with points", async () => {
    const executions = await mockExecuteAiToolPlan([call("forecast_revenue", rangeArgs)]);
    const row = executions[0]!.rows[0] as { points?: unknown[]; insufficient_data?: boolean };
    expect(row.insufficient_data).toBe(false);
    expect(row.points?.length).toBe(30);
  });

  it("failTool returns error execution", async () => {
    const executions = await mockExecuteAiToolPlan([call("sales_summary", rangeArgs)], {
      scenario: "base",
      failTool: "sales_summary",
    });
    expect(executions[0]!.error).toContain("Tool timeout");
    expect(executions[0]!.rows).toEqual([]);
  });
});
