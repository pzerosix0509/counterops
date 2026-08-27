/**
 * Semantic metric catalog — nguồn sự thật cho AI analytics.
 *
 * Mỗi metric định nghĩa chính xác cách tính, grain, dimension, filter,
 * alias tiếng Việt, câu hỏi mẫu và rule đối soát. Catalog có version;
 * mọi thay đổi định nghĩa phải bump CATALOG_VERSION (cache tự invalidate).
 *
 * Các định nghĩa KHỚP CHÍNH XÁC với SQL RPC hiện tại (supabase/migrations/
 * 20260701131012_ai_conversations_and_analytics.sql):
 * - Order hợp lệ: status = 'paid' (KHÔNG gồm partially_paid)
 * - Ngày tính doanh thu: coalesce(closed_at, last_payment.paid_at, opened_at)
 *   (KHÔNG phải opened_at như dashboard TS/EOD cũ — cố ý, ghi chú bên dưới)
 * - COGS: sum(cost_price_snapshot * quantity) loại item cancelled_at
 * - Phí kênh: round(total_amount * platform_fee_percent / 100)
 * - net_profit = gross_profit - channel_fees (không có chi phí vận hành khác)
 */

export type MetricFormat = "currency" | "number" | "percent";
export type MetricGrain = "hour" | "day" | "week" | "month";
export type MetricDimension = "time" | "channel" | "category" | "product" | "branch";
export type MetricComparison = "none" | "previous_period";
export type RpcName =
  | "ai_sales_summary"
  | "ai_sales_timeseries"
  | "ai_top_products"
  | "ai_category_summary"
  | "ai_channel_summary"
  | "ai_period_comparison";

export interface MetricFilter {
  field: string;
  op: "eq" | "in" | "ne";
  values: string[]; // các giá trị hợp lệ
  description: string;
}

export interface ReconciliationRule {
  /** Nếu metric này bằng tổng của một chuỗi khác theo time range (vd net_revenue = Σ timeseries) */
  sumsTo?: { metric: string; source: "timeseries" | "summary" };
  /** Nếu breakdown (top_products/category/channel) không được vượt tổng parent */
  parent?: { metric: string; tolerancePct: number; note?: string };
  tolerancePct: number; // sai số cho phép (0.005 = 0.5%)
}

export interface MetricDefinition {
  key: string;
  version: string;
  label: string;
  description: string;
  formula: string;
  format: MetricFormat;
  grain: MetricGrain[];
  dimensions: MetricDimension[];
  filters: MetricFilter[];
  aliases: string[]; // tiếng Việt có/không dấu, colloquial
  exampleQuestions: string[];
  comparison: MetricComparison;
  rpc: RpcName;
  reconciliation?: ReconciliationRule;
}

export interface DimensionDefinition {
  key: MetricDimension;
  label: string;
  aliases: string[];
  /** Nguồn để resolve giá trị mơ hồ (entity ambiguity) */
  valuesSource?: "sales_channels" | "menu_categories" | "products";
}

export interface MetricCatalog {
  version: string;
  metrics: MetricDefinition[];
  dimensions: DimensionDefinition[];
}

export const CATALOG_VERSION = "1.0.0";

export const METRIC_CATALOG: MetricCatalog = {
  version: CATALOG_VERSION,
  metrics: [
    {
      key: "net_revenue",
      version: "1.0.0",
      label: "Doanh thu thuần",
      description:
        "Tổng tiền của các đơn đã thanh toán (status=paid) trong kỳ. Không gồm đơn cancelled/refunded/draft. Ngày tính theo coalesce(closed_at, paid_at, opened_at) — cố ý khác dashboard cũ dùng opened_at.",
      formula: "sum(orders.total_amount) where orders.status = 'paid'",
      format: "currency",
      grain: ["hour", "day", "week", "month"],
      dimensions: ["time", "channel", "category", "product", "branch"],
      filters: [{ field: "status", op: "eq", values: ["paid"], description: "Chỉ đơn đã thanh toán" }],
      aliases: ["doanh thu", "doanh thu thuan", "net revenue", "revenue", "tong tien", "doanh so"],
      exampleQuestions: ["Doanh thu hôm nay là bao nhiêu?", "Tổng doanh thu tháng này?"],
      comparison: "previous_period",
      rpc: "ai_sales_summary",
      reconciliation: {
        sumsTo: { metric: "net_revenue", source: "timeseries" },
        tolerancePct: 0.005,
      },
    },
    {
      key: "cost_of_goods",
      version: "1.0.0",
      label: "Giá vốn",
      description: "Tổng giá vốn snapshot (cost_price_snapshot × quantity) của các món không bị hủy (cancelled_at is null).",
      formula: "sum(order_items.cost_price_snapshot * quantity) where cancelled_at is null",
      format: "currency",
      grain: ["hour", "day", "week", "month"],
      dimensions: ["time", "category", "product", "branch"],
      filters: [{ field: "cancelled_at", op: "eq", values: ["null"], description: "Loại món đã hủy" }],
      aliases: ["gia von", "cogs", "cost of goods", "chi phi nguyen lieu"],
      exampleQuestions: ["Giá vốn tháng này là bao nhiêu?", "Chi phí nguyên liệu tuần qua?"],
      comparison: "previous_period",
      rpc: "ai_sales_summary",
      reconciliation: { tolerancePct: 0.005 },
    },
    {
      key: "gross_profit",
      version: "1.0.0",
      label: "Lợi nhuận gộp",
      description: "Doanh thu thuần trừ giá vốn.",
      formula: "net_revenue - cost_of_goods",
      format: "currency",
      grain: ["hour", "day", "week", "month"],
      dimensions: ["time", "channel", "category", "product", "branch"],
      filters: [],
      aliases: ["loi nhuan gop", "gross profit", "loi nhuan"],
      exampleQuestions: ["Lợi nhuận gộp tháng này?"],
      comparison: "previous_period",
      rpc: "ai_sales_summary",
      reconciliation: { tolerancePct: 0.005 },
    },
    {
      key: "channel_fees",
      version: "1.0.0",
      label: "Phí kênh bán",
      description: "Doanh thu nhân phần trăm phí của kênh bán (platform_fee_percent), làm tròn.",
      formula: "round(orders.total_amount * sales_channels.platform_fee_percent / 100)",
      format: "currency",
      grain: ["hour", "day", "week", "month"],
      dimensions: ["time", "channel", "branch"],
      filters: [],
      aliases: ["phi kenh", "phi kenh ban", "channel fee", "hoa hong kenh"],
      exampleQuestions: ["Phí kênh bán tháng này?", "Hoa hồng phải trả cho Grab?"],
      comparison: "previous_period",
      rpc: "ai_sales_summary",
      reconciliation: { tolerancePct: 0.005 },
    },
    {
      key: "net_profit",
      version: "1.0.0",
      label: "Lợi nhuận sau phí",
      description: "Lợi nhuận gộp trừ phí kênh bán. Không gồm chi phí vận hành/lương/mặt bằng (không có trong schema).",
      formula: "gross_profit - channel_fees",
      format: "currency",
      grain: ["hour", "day", "week", "month"],
      dimensions: ["time", "channel", "category", "product", "branch"],
      filters: [],
      aliases: ["loi nhuan sau phi", "net profit", "loi nhuan rong"],
      exampleQuestions: ["Lợi nhuận sau phí tuần này?"],
      comparison: "previous_period",
      rpc: "ai_sales_summary",
      reconciliation: { tolerancePct: 0.005 },
    },
    {
      key: "total_orders",
      version: "1.0.0",
      label: "Số đơn",
      description: "Số đơn có trạng thái đã thanh toán (status=paid) trong kỳ.",
      formula: "count(orders.id) where status = 'paid'",
      format: "number",
      grain: ["hour", "day", "week", "month"],
      dimensions: ["time", "channel", "branch"],
      filters: [{ field: "status", op: "eq", values: ["paid"], description: "Chỉ đơn đã thanh toán" }],
      aliases: ["so don", "so don hang", "don hang", "total orders", "orders", "so luong don", "don"],
      exampleQuestions: ["Hôm nay có bao nhiêu đơn?", "Số đơn tháng này?"],
      comparison: "previous_period",
      rpc: "ai_sales_summary",
      reconciliation: {
        sumsTo: { metric: "total_orders", source: "timeseries" },
        tolerancePct: 0,
      },
    },
  ],
  dimensions: [
    {
      key: "time",
      label: "Thời gian",
      aliases: ["thoi gian", "ngay", "tuan", "thang", "gio"],
      valuesSource: undefined,
    },
    {
      key: "channel",
      label: "Kênh bán",
      aliases: ["kenh", "kenh ban", "sales channel", "channel", "grab", "shopee", "befood"],
      valuesSource: "sales_channels",
    },
    {
      key: "category",
      label: "Nhóm món",
      aliases: ["nhom mon", "danh muc", "category", "nhom"],
      valuesSource: "menu_categories",
    },
    {
      key: "product",
      label: "Món",
      aliases: ["mon", "san pham", "product", "mon an", "top"],
      valuesSource: "products",
    },
    {
      key: "branch",
      label: "Chi nhánh",
      aliases: ["chi nhanh", "branch", "cua hang"],
      valuesSource: undefined,
    },
  ],
};

export function getMetric(key: string): MetricDefinition | undefined {
  return METRIC_CATALOG.metrics.find((m) => m.key === key);
}

export function getDimension(key: MetricDimension): DimensionDefinition | undefined {
  return METRIC_CATALOG.dimensions.find((d) => d.key === key);
}

/** Normalize tiếng Việt: lowercase + NFD + bỏ dấu + đ→d (khớp normalizeIntentText) */
export function normalizeCatalogText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .replace(/đ/g, "d");
}

export interface ResolvedMetric {
  key: string;
  version: string;
  alias: string;
}

/**
 * Tìm metric từ câu hỏi qua alias (đã strip dấu).
 * Trả metric đầu tiên match — ưu tiên alias dài hơn (net_profit trước gross_profit...)
 * để tránh "lợi nhuận gộp" khớp "lợi nhuận" chung.
 */
export function resolveMetricFromText(text: string): ResolvedMetric | null {
  const q = normalizeCatalogText(text);
  const sorted = [...METRIC_CATALOG.metrics].sort((a, b) =>
    Math.max(...b.aliases.map((x) => x.length)) - Math.max(...a.aliases.map((x) => x.length)),
  );
  for (const metric of sorted) {
    const match = metric.aliases.find((alias) => q.includes(normalizeCatalogText(alias)));
    if (match) return { key: metric.key, version: metric.version, alias: match };
  }
  return null;
}

/** Bản rút gọn cho LLM prompt (giới hạn token, không đổ toàn bộ exampleQuestions) */
export function catalogSummaryForPrompt(): string {
  const metricLines = METRIC_CATALOG.metrics.map((m) =>
    `- ${m.key} (v${m.version}): ${m.label}. ${m.description} [${m.format}, so sánh: ${m.comparison}, RPC: ${m.rpc}]`,
  );
  const dimLines = METRIC_CATALOG.dimensions.map((d) => `- ${d.key}: ${d.label} (alias: ${d.aliases.join(", ")})`);
  return [
    `Metric catalog v${METRIC_CATALOG.version}:`,
    ...metricLines,
    `Dimensions:`,
    ...dimLines,
  ].join("\n");
}
