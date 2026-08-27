/**
 * Semantic compiler — ánh xạ SemanticQuery (có cấu trúc) sang tool calls RPC đã duyệt.
 *
 * KHÔNG sinh SQL. Chỉ chọn đúng RPC có kiểm soát dựa trên metric/dimension/grain
 * trong catalog. Metric không có dimension → chỉ sales_summary (hoặc period_comparison
 * nếu so sánh kỳ). Grain time → thêm sales_timeseries. Dimension product/category/
 * channel → thêm tool breakdown tương ứng.
 */

import type { AiDateRange } from "@/lib/ai/semantic-layer";
import type { MetricGrain } from "@/lib/ai/metric-catalog";
import type { AiToolCall } from "@/types/ai";

export type SemanticGrain = MetricGrain;

export interface SemanticFilter {
  field: string;
  op: "eq" | "in" | "ne";
  value: string | string[];
}

export interface SemanticQuery {
  metric: string; // catalog key
  metricVersion: string;
  dimensions: SemanticDimension[];
  filters: SemanticFilter[];
  grain: SemanticGrain;
  range: AiDateRange;
  timezone: string;
  comparison?: "previous_period";
  limit?: number;
}

export type SemanticDimension = "time" | "channel" | "category" | "product";

/**
 * Compile một semantic query thành danh sách tool calls.
 * Luôn bắt đầu bằng sales_summary (trừ khi metric không có trong summary).
 * Thêm period_comparison nếu comparison=previous_period.
 * Thêm sales_timeseries nếu có dimension time (trừ comparison-only).
 * Thêm breakdown tool theo dimension product/category/channel.
 */
export function compileSemanticQuery(query: SemanticQuery): AiToolCall[] {
  const tools: AiToolCall[] = [];
  const common = {
    from: query.range.from,
    to: query.range.to,
    rangeLabel: query.range.label,
    timezone: query.timezone,
  };
  const id = (name: string) => `tool-${tools.length + 1}-${name}`;

  const hasDim = (d: SemanticDimension) => query.dimensions.includes(d);

  tools.push({ id: id("sales_summary"), name: "sales_summary", arguments: { ...common } });

  if (query.comparison === "previous_period") {
    tools.push({ id: id("period_comparison"), name: "period_comparison", arguments: { ...common } });
  }

  if (hasDim("time") && query.grain) {
    tools.push({
      id: id("sales_timeseries"),
      name: "sales_timeseries",
      arguments: { ...common, granularity: query.grain },
    });
  }

  if (hasDim("product")) {
    tools.push({ id: id("top_products"), name: "top_products", arguments: { ...common, limit: query.limit ?? 10 } });
  }

  if (hasDim("category")) {
    tools.push({ id: id("category_summary"), name: "category_summary", arguments: { ...common, limit: query.limit ?? 20 } });
  }

  if (hasDim("channel")) {
    tools.push({ id: id("channel_summary"), name: "channel_summary", arguments: { ...common } });
  }

  return tools;
}

/**
 * Map một intent analytics sang semantic query mặc định.
 * - metric_lookup → sales_summary, không dimension
 * - trend → + time dimension, grain từ range/question
 * - comparison → + previous_period
 * - product_ranking → + product
 * - category_analysis → + category
 * - channel_analysis → + channel
 */
export function semanticQueryForIntent(
  intent: string,
  range: AiDateRange,
  timezone: string,
  question: string,
  metricKey = "net_revenue",
  metricVersion = "1.0.0",
): SemanticQuery | null {
  const base: SemanticQuery = {
    metric: metricKey,
    metricVersion,
    dimensions: [],
    filters: [],
    grain: "day",
    range,
    timezone,
  };

  switch (intent) {
    case "metric_lookup":
      return base;
    case "trend":
      return { ...base, dimensions: ["time"], grain: chooseGrainFromQuestion(question, range) };
    case "comparison":
      return { ...base, comparison: "previous_period" };
    case "product_ranking":
      return { ...base, dimensions: ["product"], limit: 10 };
    case "category_analysis":
      return { ...base, dimensions: ["category"], limit: 20 };
    case "channel_analysis":
      return { ...base, dimensions: ["channel"] };
    default:
      return null;
  }
}

export function chooseGrainFromQuestion(question: string, range: AiDateRange): SemanticGrain {
  const q = question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .replace(/đ/g, "d");
  if (q.includes("theo gio") || q.includes("hourly") || range.label === "Hôm nay") return "hour";
  if (q.includes("theo thang") || q.includes("monthly")) return "month";
  if (q.includes("theo tuan") || q.includes("weekly")) return "week";
  return "day";
}
