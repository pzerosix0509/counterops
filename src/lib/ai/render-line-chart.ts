/**
 * Tool `render_line_chart` — AI gọi với (data, xLabel, yLabel, title) để nhận về
 * một AiChartSpec loại "line". Cùng pipeline với chart tự sinh từ analytics:
 * orchestrator sẽ gán spec này vào `response.chart` và `ChartSpecRenderer`
 * (recharts) sẽ vẽ nó. Không cần thêm thư viện vẽ.
 */
import "server-only";
import type { AiAnalyticsContext, AiChartSpec } from "@/types/ai";

export interface RenderLineChartArgs {
  /** Mỗi phần tử là một object có key tương ứng với xLabel và yLabel. */
  data: Array<Record<string, unknown>>;
  /** Tên trục X (cũng là key trong data). */
  xLabel: string;
  /** Tên trục Y (cũng là key trong data, giá trị nên là số). */
  yLabel: string;
  /** Tiêu đề biểu đồ. */
  title: string;
}

export type ChartType = AiChartSpec["type"];

const MAX_TITLE = 200;
const MAX_LABEL = 80;
const MAX_POINTS = 10_000;

function isLabel(value: unknown, name: string): value is string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`render_line_chart: ${name} phải là chuỗi khác rỗng.`);
  }
  return true;
}

export function buildLineChartSpec(args: RenderLineChartArgs): AiChartSpec {
  if (!args || typeof args !== "object") {
    throw new Error("render_line_chart: thiếu tham số.");
  }
  if (!Array.isArray(args.data)) {
    throw new Error("render_line_chart: data phải là mảng.");
  }
  if (args.data.length === 0) {
    throw new Error("render_line_chart: data phải có ít nhất 1 phần tử.");
  }
  if (args.data.length > MAX_POINTS) {
    throw new Error(`render_line_chart: data vượt quá ${MAX_POINTS} điểm.`);
  }
  isLabel(args.xLabel, "xLabel");
  isLabel(args.yLabel, "yLabel");
  isLabel(args.title, "title");
  if (args.title.length > MAX_TITLE) {
    throw new Error(`render_line_chart: title vượt quá ${MAX_TITLE} ký tự.`);
  }
  if (args.xLabel.length > MAX_LABEL || args.yLabel.length > MAX_LABEL) {
    throw new Error(`render_line_chart: xLabel/yLabel vượt quá ${MAX_LABEL} ký tự.`);
  }
  // Cảnh báo sớm: nếu không có dòng nào có key `yLabel` là số, chart sẽ rỗng.
  const hasAnyNumeric = args.data.some(
    (row) => row != null && typeof row === "object" && typeof (row as Record<string, unknown>)[args.yLabel] === "number",
  );
  if (!hasAnyNumeric) {
    throw new Error(`render_line_chart: không có phần tử nào có key "${args.yLabel}" mang giá trị số.`);
  }
  return {
    type: "line",
    title: args.title,
    xKey: args.xLabel,
    yKey: args.yLabel,
    data: args.data as Array<Record<string, string | number>>,
  };
}

/**
 * Trích loại biểu đồ mà user yêu cầu trong câu hỏi.
 * Trả về null nếu user KHÔNG nói rõ — để caller dùng default theo data branch.
 *
 * Match theo 3 nhóm (ưu tiên từ cụ thể → tổng quát):
 * 1. Compound chart-type (line chart / pie chart / bar chart / donut chart / area chart)
 * 2. "biểu đồ <type>" / "đồ thị <type>"
 * 3. "vẽ" / "draw" / "render" + <type>
 *
 * Match cả tiếng Anh ("line chart") lẫn Việt không dấu ("bieu do duong").
 */
export function extractChartType(question: string): ChartType | null {
  if (!question) return null;
  const q = question
    .toLocaleLowerCase("vi")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

  // 1. Compound chart-type keywords (most reliable)
  if (/\b(line chart|linechart)\b/.test(q)) return "line";
  if (/\b(pie chart|piechart)\b/.test(q)) return "pie";
  if (/\b(bar chart|barchart|column chart)\b/.test(q)) return "bar";
  if (/\b(donut chart|donutchart)\b/.test(q)) return "donut";
  if (/\b(area chart|areachart)\b/.test(q)) return "area";
  if (/\b(mixed chart|combined chart|composed chart)\b/.test(q)) return "composed";

  // 2. "biểu đồ <type>" / "đồ thị <type>"
  if (/\b(bieu do|do thi)\s+(line|duong)\b/.test(q)) return "line";
  if (/\b(bieu do|do thi)\s+(pie|tron)\b/.test(q)) return "pie";
  if (/\b(bieu do|do thi)\s+(bar|cot)\b/.test(q)) return "bar";
  if (/\b(bieu do|do thi)\s+(donut|tron rong)\b/.test(q)) return "donut";
  if (/\b(bieu do|do thi)\s+(area|vung)\b/.test(q)) return "area";
  if (/\b(bieu do|do thi)\s+(mixed|combined|ket hop)\b/.test(q)) return "composed";

  // 3. "vẽ/draw/render/plot" + <type>
  if (/\b(ve|draw|render|plot)\b/.test(q) && /\b(line|duong)\b/.test(q)) return "line";
  if (/\b(ve|draw|render|plot)\b/.test(q) && /\b(pie|tron)\b/.test(q)) return "pie";
  if (/\b(ve|draw|render|plot)\b/.test(q) && /\b(bar|cot)\b/.test(q)) return "bar";
  if (/\b(ve|draw|render|plot)\b/.test(q) && /\b(donut|tron rong)\b/.test(q)) return "donut";
  if (/\b(ve|draw|render|plot)\b/.test(q) && /\b(area|vung)\b/.test(q)) return "area";

  return null;
}

/**
 * Sinh RenderLineChartArgs từ timeseries của analytics — orchestrator dùng khi user
 * yêu cầu line chart mà dữ liệu đã có sẵn (tránh phải gọi lại tool).
 */
export function analyticsTimeseriesToChartArgs(
  analytics: AiAnalyticsContext,
  title: string,
): RenderLineChartArgs {
  return {
    data: analytics.salesTimeseries.map((row) => ({
      period: row.period_start,
      revenue: row.net_revenue,
    })),
    xLabel: "period",
    yLabel: "revenue",
    title,
  };
}
