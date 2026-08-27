export interface AiSource {
  id: string;
  label: string;
  type: "analytics" | "document" | "web";
  detail?: string;
  excerpt?: string;
  meta?: Record<string, unknown>;
}

/** Provenance bắt buộc cho mọi source dữ liệu (analytic + retrieval) */
export interface AiSourceProvenance {
  /** Thời điểm dữ liệu được chụp (chung cho cả phiên chạy tool) */
  asOf: string;
  /** Id snapshot cho cả phiên — mọi tool cùng một snapshot */
  snapshotId: string;
  /** Hash ổn định của {rpc, arguments} — dùng để đối chiếu query khi eval */
  queryHash?: string;
  /** Thời điểm dữ liệu thực sự được lấy (khác asOf khi trúng cache) */
  sourceAsOf?: string;
  cacheHit?: boolean;
  /** Catalog version dùng khi compile semantic query */
  catalogVersion?: string;
  /** Metric được hỏi (nếu có) */
  metricKey?: string;
  metricVersion?: string;
  grain?: string;
  rangeLabel?: string;
  timezone?: string;
  /** Đã qua đối soát số liệu chưa */
  reconciled?: boolean;
}

export type AiIntent =
  | "greeting"
  | "metric_lookup"
  | "trend"
  | "comparison"
  | "product_ranking"
  | "category_analysis"
  | "channel_analysis"
  | "inventory_risk"
  | "document_search"
  | "web_search"
  | "dashboard"
  | "diagnosis"
  | "forecast"
  | "conversation_summary"
  | "out_of_scope";

export type AiModelTier = "none" | "fast" | "quality";
export type AiResponseMode = "deterministic" | "model" | "fallback";

export interface AiClarification {
  question: string;
  options: string[];
  reason: "intent" | "entity";
}

/** Structured conversation state — lưu jsonb trong ai_chat_sessions.memory_state */
export interface AiMemoryState {
  lastRange?: { from: string; to: string; label: string };
  lastMetric?: { key: string; version: string };
  lastDimensions?: string[];
  lastGrain?: string;
  lastComparison?: string;
  lastChart?: { type: string; title: string } | null;
  lastQuery?: { tool: string; arguments: Record<string, unknown> } | null;
  /** Tên kênh/món đã nhắc trong hội thoại */
  mentionedEntities?: string[];
  updatedAt: string;
}

export interface AiStatisticalFindings {
  correlation?: { metric: "revenue_vs_orders"; r: number; pValue: number; significant: boolean };
  outliers?: Array<{ date: string; value: number; zScore: number; direction: "up" | "down" }>;
  seasonality?: { dayOfWeek: Record<string, number>; strongestDay: string; weakestDay: string };
  tTest?: { label: string; t: number; pValue: number; significant: boolean };
  growth?: { cagr: number; total: number } | null;
}

export interface AiPlan {
  intent: AiIntent;
  intentConfidence: number;
  modelTier: AiModelTier;
  deterministic: boolean;
  rationale: string;
  range: { from: string; to: string; label: string };
  tools: AiToolCall[];
  /** Semantic query đã compile (chỉ với intent analytics) — nguồn provenance */
  semanticQuery?: {
    metric: string;
    metricVersion: string;
    dimensions: string[];
    grain: string;
    comparison?: string;
  };
  /** Cần làm rõ trước khi chạy tool (câu mơ hồ) */
  clarification?: AiClarification;
}

export interface AiDataQualityIssue {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface AiConfidenceComponents {
  /** Độ đúng của query: tool errors, intent confidence, semantic query hợp lệ */
  query: number;
  /** Độ đầy đủ dữ liệu: sample size, missing summary, empty/partial period */
  dataCompleteness: number;
  /** Độ nhất quán số liệu: kết quả đối soát (reconciliation) */
  consistency: number;
  /** Độ phù hợp của phân tích: anomaly, forecast insufficient data, intent-data khớp */
  analysisFit: number;
  /** Độ tin cậy dự báo (null nếu không phải câu hỏi forecast) */
  forecastReliability: number | null;
}

export interface AiConfidence {
  score: number;
  level: "low" | "medium" | "high";
  reasons: string[];
  sampleSize: number | null;
  components: AiConfidenceComponents;
}

export interface AiAnomaly {
  code: string;
  severity: "info" | "warning" | "critical";
  title: string;
  description: string;
}

export interface AiProviderAttempt {
  provider: string;
  model: string;
  durationMs: number;
  outcome: "success" | "error" | "timeout" | "circuit_open" | "invalid_schema";
}

export interface AiTelemetry {
  plannerMs: number;
  toolsMs: number;
  retrievalMs: number;
  providerMs: number;
  responseReadyMs: number;
  totalMs: number;
  cacheHits: number;
  cacheMisses: number;
  providerAttempts: AiProviderAttempt[];
  /** Số vòng loop của multi-step planner (1 = không loop) */
  plannerRounds?: number;
  /** Loop dừng sớm do confidence đủ cao? */
  plannerStoppedEarly?: boolean;
}

export type AiProgressStage =
  | "planning"
  | "querying"
  | "assessing"
  | "generating"
  | "persisting";

export type AiStreamEvent =
  | { type: "progress"; stage: AiProgressStage; message: string }
  | { type: "result"; data: AiChatResponse }
  | { type: "error"; error: string };

export interface AiChartSpec {
  type: "bar" | "line" | "area" | "pie" | "donut" | "composed";
  title: string;
  xKey: string;
  yKey: string;
  data: Array<Record<string, string | number>>;
}

export interface AiDashboardCardSpec {
  title: string;
  value: string | number;
  description?: string;
  tone?: "neutral" | "good" | "warning" | "bad";
  delta?: {
    label: string;
    value: string | number;
    direction?: "up" | "down" | "flat";
  };
}

export interface AiDashboardTableSpec {
  title: string;
  columns: Array<{ key: string; label: string; align?: "left" | "right" }>;
  rows: Array<Record<string, string | number>>;
}

export interface AiDashboardSpec {
  title: string;
  description?: string;
  layout: "grid";
  filters: string[];
  cards: AiDashboardCardSpec[];
  charts: AiChartSpec[];
  tables: AiDashboardTableSpec[];
  insights: string[];
}

export interface AiForecastPoint {
  period_start: string;
  forecasted_revenue: number;
  forecasted_orders: number;
  lower_bound: number;
  upper_bound: number;
}

export interface ForecastBacktestResult {
  method: string;
  trainDays: number;
  testDays: number;
  /** Weighted Mean Absolute Percentage Error trên test */
  wmape: number | null;
  /** Mean Absolute Scaled Error (baseline = naive 1-step) */
  mase: number | null;
  byHorizon: Array<{ horizon: number; wmape: number | null; mase: number | null }>;
  sampleSize: number;
}

export interface AiForecastResult {
  horizon_days: number;
  method: "weighted_moving_average";
  training_days: number;
  points: AiForecastPoint[];
  insufficient_data: boolean;
  min_days_required: number;
  /** Backtest WMAPE/MASE — null nếu chưa đủ dữ liệu hoặc không chạy */
  backtest?: ForecastBacktestResult | null;
}

export interface AiAnalyticsContext {
  range: { from: string; to: string; label: string };
  salesSummary: {
    total_orders: number;
    net_revenue: number;
    cost_of_goods: number;
    gross_profit: number;
    channel_fees: number;
    net_profit: number;
  } | null;
  topProducts: Array<{
    product_name: string;
    quantity: number;
    revenue: number;
    cost_of_goods: number;
    gross_profit: number;
  }>;
  channelSummary: Array<{
    channel_name: string;
    orders: number;
    revenue: number;
    channel_fees: number;
  }>;
  salesTimeseries: Array<{
    period_start: string;
    total_orders: number;
    net_revenue: number;
    cost_of_goods: number;
    gross_profit: number;
    channel_fees: number;
    net_profit: number;
  }>;
  categorySummary: Array<{
    category_id: string | null;
    category_name: string;
    quantity: number;
    revenue: number;
    cost_of_goods: number;
    gross_profit: number;
  }>;
  periodComparison: {
    current_orders: number;
    previous_orders: number;
    orders_delta_percent: number | null;
    current_revenue: number;
    previous_revenue: number;
    revenue_delta_percent: number | null;
    current_profit: number;
    previous_profit: number;
    profit_delta_percent: number | null;
  } | null;
  /** Driver decomposition (orders × AOV) — tính khi có periodComparison */
  decomposition?: {
    delta: number;
    ordersEffect: number;
    aovEffect: number;
    ordersSharePct: number | null;
    aovSharePct: number | null;
  } | null;
  /** Kết quả phân tích thống kê (chạy khi intent diagnosis/trend đủ dữ liệu) */
  statisticalFindings?: AiStatisticalFindings | null;
  forecastRevenue: AiForecastResult | null;
}

export type AiToolName =
  | "sales_summary"
  | "sales_timeseries"
  | "top_products"
  | "category_summary"
  | "channel_summary"
  | "period_comparison"
  | "inventory_risk"
  | "search_documents"
  | "search_web"
  | "forecast_revenue";

export interface AiToolCall {
  id: string;
  name: AiToolName;
  arguments: Record<string, string | number | boolean | null>;
}

export interface AiToolExecution {
  call: AiToolCall;
  rows: Array<Record<string, unknown>>;
  sources?: AiSource[];
  durationMs: number;
  cacheHit?: boolean;
  error?: string;
}

export interface AiModelUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;
}

export interface AiUsageSummary {
  totalRuns: number;
  totalTokens: number;
  estimatedCostUsd: number;
  fallbackRuns: number;
  averageLatencyMs: number;
}

export interface AiChatResponse {
  answer: string;
  bullets: string[];
  chart: AiChartSpec | null;
  dashboard: AiDashboardSpec | null;
  sources: AiSource[];
  modelUsed: string | null;
  usedFallback: boolean;
  fallbackReason?: string;
  sessionId: string;
  messageId: string;
  runId: string | null;
  toolCalls: AiToolCall[];
  usage: AiModelUsage | null;
  responseMode: AiResponseMode;
  intent: AiIntent;
  intentConfidence: number;
  confidence: AiConfidence;
  qualityIssues: AiDataQualityIssue[];
  anomalies: AiAnomaly[];
  telemetry: AiTelemetry;
  /** Câu hỏi làm rõ (câu mơ hồ) — client render như message text */
  clarification?: AiClarification;
}

export interface AiChatSessionSummary {
  id: string;
  title: string;
  mode: "chat" | "dashboard";
  messageCount: number;
  lastMessageAt: string;
  createdAt: string;
  isPinned: boolean;
}

export interface AiStoredChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  response: AiChatResponse | null;
  createdAt: string;
  feedback: -1 | 1 | null;
}
