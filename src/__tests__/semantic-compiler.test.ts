import { describe, expect, it } from "vitest";
import {
  compileSemanticQuery,
  semanticQueryForIntent,
  type SemanticQuery,
} from "@/lib/ai/semantic-compiler";
import { buildAiPlan } from "@/lib/ai/semantic-layer";

const range = { from: "2026-07-01T00:00:00.000Z", to: "2026-07-01T23:59:59.999Z", label: "Hôm nay" };

describe("semantic compiler", () => {
  it("compiles metric_lookup to sales_summary only", () => {
    const query: SemanticQuery = {
      metric: "net_revenue",
      metricVersion: "1.0.0",
      dimensions: [],
      filters: [],
      grain: "day",
      range,
      timezone: "Asia/Ho_Chi_Minh",
    };
    const tools = compileSemanticQuery(query);
    expect(tools.map((t) => t.name)).toEqual(["sales_summary"]);
    expect(tools[0]?.arguments).toMatchObject({ timezone: "Asia/Ho_Chi_Minh" });
  });

  it("adds timeseries for time dimension and breakdown tools for product/category/channel", () => {
    const query: SemanticQuery = {
      metric: "net_revenue",
      metricVersion: "1.0.0",
      dimensions: ["time", "product", "category", "channel"],
      filters: [],
      grain: "day",
      range,
      timezone: "Asia/Ho_Chi_Minh",
    };
    const tools = compileSemanticQuery(query);
    expect(tools.map((t) => t.name)).toEqual([
      "sales_summary",
      "sales_timeseries",
      "top_products",
      "category_summary",
      "channel_summary",
    ]);
    expect(tools[1]?.arguments.granularity).toBe("day");
  });

  it("adds period_comparison when comparison=previous_period", () => {
    const query: SemanticQuery = {
      metric: "net_revenue",
      metricVersion: "1.0.0",
      dimensions: [],
      filters: [],
      grain: "day",
      range,
      timezone: "Asia/Ho_Chi_Minh",
      comparison: "previous_period",
    };
    const tools = compileSemanticQuery(query);
    expect(tools.map((t) => t.name)).toEqual(["sales_summary", "period_comparison"]);
  });

  it("maps intent to semantic query with correct dimensions", () => {
    expect(semanticQueryForIntent("metric_lookup", range, "Asia/Ho_Chi_Minh", "Doanh thu hôm nay")?.dimensions).toEqual([]);
    expect(semanticQueryForIntent("trend", range, "Asia/Ho_Chi_Minh", "Xu hướng doanh thu 7 ngày")?.dimensions).toEqual(["time"]);
    expect(semanticQueryForIntent("comparison", range, "Asia/Ho_Chi_Minh", "So sánh tuần này")?.comparison).toBe("previous_period");
    expect(semanticQueryForIntent("product_ranking", range, "Asia/Ho_Chi_Minh", "Top món")?.dimensions).toEqual(["product"]);
    expect(semanticQueryForIntent("channel_analysis", range, "Asia/Ho_Chi_Minh", "Kênh bán")?.dimensions).toEqual(["channel"]);
    expect(semanticQueryForIntent("dashboard", range, "Asia/Ho_Chi_Minh", "Dashboard")).toBeNull();
  });

  it("carries grain from question (hourly for today)", () => {
    const q = semanticQueryForIntent("trend", range, "Asia/Ho_Chi_Minh", "Doanh thu theo giờ hôm nay");
    expect(q?.grain).toBe("hour");
  });

  it("embeds semanticQuery in the AiPlan for analytics intents", () => {
    const plan = buildAiPlan("Doanh thu hôm nay là bao nhiêu?", "chat", new Date("2026-07-01T12:00:00+07:00"));
    expect(plan.semanticQuery?.metric).toBe("net_revenue");
    expect(plan.semanticQuery?.metricVersion).toBe("1.0.0");
    expect(plan.semanticQuery?.dimensions).toEqual([]);
  });

  it("omits semanticQuery for non-analytics intents", () => {
    const plan = buildAiPlan("Xin chào", "chat", new Date("2026-07-01T12:00:00+07:00"));
    expect(plan.semanticQuery).toBeUndefined();
  });
});
