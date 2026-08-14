export interface AiSource {
  id: string;
  label: string;
  type: "analytics" | "document" | "web";
  detail?: string;
  excerpt?: string;
  meta?: Record<string, unknown>;
}

export type AiIntent =
  | "greeting"
  | "capability"
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
  | "sentiment"
  | "conversation_summary"
  | "out_of_scope";

export type AiModelTier = "none" | "fast" | "quality";
export type AiResponseMode = "deterministic" | "model" | "fallback";

export interface AiPlan {
  intent: AiIntent;
  intentConfidence: number;
  modelTier: AiModelTier;
  deterministic: boolean;
  rationale: string;
  range: { from: string; to: string; label: string };
  tools: AiToolCall[];
}

export interface AiDataQualityIssue {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
}

export interface AiConfidence {
  score: number;
  level: "low" | "medium" | "high";
  reasons: string[];
  sampleSize: number | null;
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

export interface AiForecastResult {
  horizon_days: number;
  method: "weighted_moving_average";
  training_days: number;
  points: AiForecastPoint[];
  insufficient_data: boolean;
  min_days_required: number;
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
  | "forecast_revenue"
  | "sentiment_summary";

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
