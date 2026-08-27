import { compileSemanticQuery, semanticQueryForIntent } from "@/lib/ai/semantic-compiler";
import { detectIntentAmbiguity } from "@/lib/ai/clarification";
import { resolveMetricFromText } from "@/lib/ai/metric-catalog";
import type { AiIntent, AiModelTier, AiPlan, AiToolCall, AiToolName } from "@/types/ai";

export interface AiDateRange {
  from: string;
  to: string;
  label: string;
}

export interface SemanticMetricDefinition {
  key: string;
  label: string;
  description: string;
  format: "currency" | "number" | "percent";
  source: string;
}

export interface AnalyticsToolDefinition {
  name: AiToolName;
  description: string;
  metrics: string[];
  dimensions: string[];
}

export const SEMANTIC_METRICS: SemanticMetricDefinition[] = [
  {
    key: "net_revenue",
    label: "Doanh thu thuần",
    description: "Tổng tiền của đơn đã thanh toán trong kỳ.",
    format: "currency",
    source: "orders.total_amount",
  },
  {
    key: "cost_of_goods",
    label: "Giá vốn",
    description: "Tổng giá vốn snapshot của các món không bị hủy.",
    format: "currency",
    source: "order_items.cost_price_snapshot * quantity",
  },
  {
    key: "gross_profit",
    label: "Lợi nhuận gộp",
    description: "Doanh thu thuần trừ giá vốn.",
    format: "currency",
    source: "net_revenue - cost_of_goods",
  },
  {
    key: "channel_fees",
    label: "Phí kênh bán",
    description: "Doanh thu nhân phần trăm phí của kênh bán.",
    format: "currency",
    source: "orders.total_amount * sales_channels.platform_fee_percent",
  },
  {
    key: "net_profit",
    label: "Lợi nhuận sau phí",
    description: "Lợi nhuận gộp trừ phí kênh bán.",
    format: "currency",
    source: "gross_profit - channel_fees",
  },
  {
    key: "total_orders",
    label: "Số đơn",
    description: "Số đơn có trạng thái đã thanh toán trong kỳ.",
    format: "number",
    source: "count(orders.id where status = paid)",
  },
];

export const ANALYTICS_TOOL_DEFINITIONS: AnalyticsToolDefinition[] = [
  {
    name: "sales_summary",
    description: "Tổng hợp số đơn, doanh thu, giá vốn và lợi nhuận trong một kỳ.",
    metrics: ["total_orders", "net_revenue", "cost_of_goods", "gross_profit", "channel_fees", "net_profit"],
    dimensions: ["time_range", "branch"],
  },
  {
    name: "sales_timeseries",
    description: "Chuỗi thời gian doanh thu, giá vốn và lợi nhuận theo giờ/ngày/tuần/tháng.",
    metrics: ["total_orders", "net_revenue", "cost_of_goods", "gross_profit", "channel_fees", "net_profit"],
    dimensions: ["period_start", "branch"],
  },
  {
    name: "top_products",
    description: "Xếp hạng món theo doanh thu, số lượng và lợi nhuận.",
    metrics: ["quantity", "revenue", "cost_of_goods", "gross_profit"],
    dimensions: ["product"],
  },
  {
    name: "category_summary",
    description: "Phân bổ doanh thu và lợi nhuận theo nhóm món thật trong dữ liệu.",
    metrics: ["quantity", "revenue", "cost_of_goods", "gross_profit"],
    dimensions: ["category"],
  },
  {
    name: "channel_summary",
    description: "Doanh thu, số đơn và phí theo kênh bán.",
    metrics: ["orders", "revenue", "channel_fees"],
    dimensions: ["sales_channel"],
  },
  {
    name: "period_comparison",
    description: "So sánh số đơn, doanh thu và lợi nhuận với kỳ liền trước có cùng độ dài.",
    metrics: ["orders_delta_percent", "revenue_delta_percent", "profit_delta_percent"],
    dimensions: ["current_period", "previous_period"],
  },
  {
    name: "inventory_risk",
    description: "Các mặt hàng âm kho, hết hàng hoặc dưới định mức thấp.",
    metrics: ["quantity_on_hand", "low_stock_threshold"],
    dimensions: ["inventory_item", "inventory_status"],
  },
  {
    name: "search_documents",
    description: "Tìm nội dung liên quan trong tài liệu người dùng đã upload.",
    metrics: [],
    dimensions: ["document", "chunk"],
  },
];

function normalizeIntentText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function startOfDayInZone(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  // Local wall-clock in the target zone, treated as if it were UTC, minus the
  // zone offset gives the true epoch of 00:00 local in that zone.
  const localAsUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  const offsetMs = localAsUTC - date.getTime();
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")) - offsetMs);
}

function endOfDayInZone(date: Date, timezone: string) {
  const start = startOfDayInZone(date, timezone);
  return new Date(start.getTime() + 86_400_000 - 1);
}

export function inferAiDateRange(
  question: string,
  now = new Date(),
  timezone = "Asia/Ho_Chi_Minh",
): AiDateRange {
  const q = normalizeIntentText(question);
  const todayStart = startOfDayInZone(now, timezone);
  const todayEnd = endOfDayInZone(now, timezone);

  if (q.includes("hom qua") || q.includes("yesterday")) {
    const date = new Date(todayStart.getTime() - 86_400_000);
    return { from: date.toISOString(), to: new Date(date.getTime() + 86_400_000 - 1).toISOString(), label: "Hôm qua" };
  }

  if (q.includes("hom nay") || q.includes("today")) {
    // "đến giờ"/"hiện tại" → cắt to = now (kỳ hiện tại chưa hoàn tất)
    const toNow = q.includes("den gio") || q.includes("den hien tai") || q.includes("hien tai") || q.includes("so far") || q.includes("until now");
    return {
      from: todayStart.toISOString(),
      to: toNow ? now.toISOString() : todayEnd.toISOString(),
      label: "Hôm nay",
    };
  }

  if (q.includes("thang truoc") || q.includes("last month")) {
    const year = todayStart.getUTCFullYear();
    const month = todayStart.getUTCMonth();
    const from = new Date(Date.UTC(year, month - 1, 1));
    const to = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    return { from: from.toISOString(), to: to.toISOString(), label: "Tháng trước" };
  }

  if (q.includes("thang toi") || q.includes("next month")) {
    // Future month: không có dữ liệu tương lai — dùng 30 ngày lịch sử làm training window
    const from = new Date(todayStart.getTime() - 29 * 86_400_000);
    return { from: from.toISOString(), to: todayEnd.toISOString(), label: "30 ngày qua" };
  }

  if (q.includes("tuan toi") || q.includes("next week")) {
    // Future week: dùng 14 ngày lịch sử (≥ MIN_DAYS_REQUIRED)
    const from = new Date(todayStart.getTime() - 13 * 86_400_000);
    return { from: from.toISOString(), to: todayEnd.toISOString(), label: "14 ngày qua" };
  }

  if (q.includes("thang nay") || q.includes("this month")) {
    const year = todayStart.getUTCFullYear();
    const month = todayStart.getUTCMonth();
    const from = new Date(Date.UTC(year, month, 1));
    return { from: from.toISOString(), to: todayEnd.toISOString(), label: "Tháng này" };
  }

  if (q.includes("tuan truoc") || q.includes("last week")) {
    const dayIndex = (todayStart.getUTCDay() + 6) % 7; // 0 = Monday
    const currentMonday = new Date(todayStart.getTime() - dayIndex * 86_400_000);
    const from = new Date(currentMonday.getTime() - 7 * 86_400_000);
    const to = new Date(currentMonday.getTime() - 1);
    return { from: from.toISOString(), to: to.toISOString(), label: "Tuần trước" };
  }

  if (q.includes("tuan nay") || q.includes("this week")) {
    const dayIndex = (todayStart.getUTCDay() + 6) % 7; // 0 = Monday
    const from = new Date(todayStart.getTime() - dayIndex * 86_400_000);
    return { from: from.toISOString(), to: todayEnd.toISOString(), label: "Tuần này" };
  }

  const explicitDays = q.match(/(\d{1,3})\s*ngay/);
  const explicitMonths = q.match(/(\d{1,2})\s*thang/);
  if (explicitMonths) {
    const months = Math.min(Math.max(Number(explicitMonths[1]), 1), 12);
    const from = new Date(Date.UTC(
      todayStart.getUTCFullYear(),
      todayStart.getUTCMonth() - months,
      todayStart.getUTCDate(),
    ));
    return {
      from: from.toISOString(),
      to: todayEnd.toISOString(),
      label: months === 1 ? "1 tháng qua" : `${months} tháng qua`,
    };
  }
  const days = Math.min(Math.max(Number(explicitDays?.[1] ?? 7), 1), 366);
  const from = new Date(todayStart.getTime() - (days - 1) * 86_400_000);
  return {
    from: from.toISOString(),
    to: todayEnd.toISOString(),
    label: days === 7 ? "7 ngày qua" : `${days} ngày qua`,
  };
}

export function isDashboardIntent(question: string): boolean {
  const q = normalizeIntentText(question);
  return [
    "dashboard",
    "bang dieu khien",
    "kpi",
  ].some((keyword) => q.includes(keyword));
}

function hasPhrase(question: string, phrases: string[]) {
  return phrases.some((phrase) => question.includes(phrase));
}

function hasToken(question: string, tokens: string[]) {
  const words = new Set(question.split(" "));
  return tokens.some((token) => words.has(token));
}

function chooseGranularity(range: AiDateRange, question: string) {
  const q = normalizeIntentText(question);
  if (q.includes("theo gio") || q.includes("hourly") || range.label === "Hôm nay") return "hour";
  if (q.includes("theo thang") || q.includes("monthly")) return "month";
  if (q.includes("theo tuan") || q.includes("weekly")) return "week";
  return "day";
}

function inferIntent(question: string, mode: "chat" | "dashboard"): {
  intent: AiIntent;
  confidence: number;
  modelTier: AiModelTier;
  deterministic: boolean;
  rationale: string;
} {
  const scores = scoreIntents(question, mode);
  const top = scores[0];
  if (!top) {
    return {
      intent: "out_of_scope",
      confidence: 0.72,
      modelTier: "fast",
      deterministic: false,
      rationale: "Câu hỏi không thuộc dữ liệu kinh doanh — dùng mô hình để trả lời tự nhiên.",
    };
  }
  const INTENT_META: Record<AiIntent, { modelTier: AiModelTier; deterministic: boolean; rationale: string }> = {
    greeting: { modelTier: "none", deterministic: true, rationale: "Lời chào không cần truy vấn dữ liệu." },
    metric_lookup: { modelTier: "none", deterministic: true, rationale: "Yêu cầu tra cứu chỉ số kinh doanh." },
    trend: { modelTier: "none", deterministic: true, rationale: "Yêu cầu chuỗi thời gian." },
    comparison: { modelTier: "none", deterministic: true, rationale: "Yêu cầu so sánh hai kỳ." },
    product_ranking: { modelTier: "none", deterministic: true, rationale: "Yêu cầu xếp hạng món hoặc sản phẩm." },
    category_analysis: { modelTier: "none", deterministic: true, rationale: "Yêu cầu phân tích theo nhóm món." },
    channel_analysis: { modelTier: "none", deterministic: true, rationale: "Yêu cầu phân tích theo kênh bán." },
    inventory_risk: { modelTier: "none", deterministic: true, rationale: "Yêu cầu trạng thái hoặc rủi ro tồn kho." },
    document_search: { modelTier: "fast", deterministic: false, rationale: "Câu hỏi yêu cầu tra cứu tài liệu." },
    web_search: { modelTier: "fast", deterministic: false, rationale: "Yêu cầu tìm kiếm thông tin bên ngoài trên web." },
    forecast: { modelTier: "fast", deterministic: false, rationale: "Yêu cầu dự báo hoặc dự đoán tương lai." },
    dashboard: { modelTier: "none", deterministic: true, rationale: "Yêu cầu trực quan hóa có cấu trúc." },
    diagnosis: { modelTier: "quality", deterministic: false, rationale: "Yêu cầu suy luận nguyên nhân hoặc khuyến nghị." },
    conversation_summary: { modelTier: "quality", deterministic: false, rationale: "Yêu cầu tổng hợp nhiều lượt hội thoại." },
    out_of_scope: { modelTier: "fast", deterministic: false, rationale: "Câu hỏi không thuộc dữ liệu kinh doanh — dùng mô hình để trả lời tự nhiên." },
  };
  const meta = INTENT_META[top.intent];
  return { intent: top.intent, confidence: top.confidence, ...meta };
}

/** Chấm điểm mọi intent khớp keyword — dùng cho top-k + ambiguity detection */
function scoreIntents(question: string, mode: "chat" | "dashboard"): Array<{ intent: AiIntent; confidence: number }> {
  const q = normalizeIntentText(question);
  const scores: Array<{ intent: AiIntent; confidence: number }> = [];

  const isGreeting = /^(hi|hello|chao|xin chao|hey|m la ai|m là ai|m lam duoc gi|m làm được gì|ban la ai|ban lam duoc gi|ban co the giup|cam on|thank)\b/.test(q)
    || hasPhrase(q, ["giup minh", "giup toi", "lam duoc gi", "co the lam gi", "tinh nang gi", "ban la ai", "m giup", "m la ai"]);
  const documentIntent = hasPhrase(q, ["tai lieu", "da upload", "quy dinh", "huong dan", "document"]);
  const webIntent = hasPhrase(q, ["tim kiem web", "tra cuu web", "thong tin tren web", "tin tuc", "gia vang", "thoi tiet", "bitcoin", "crypto", "chung khoan", "thi truong", "web search", "ronaldo", "messi", "ca si", "cau thu", "nguoi noi tieng"])
    || /^(gia vang|thoi tiet|bitcoin|crypto|chung khoan)\b/.test(q)
    || (/^gia\b/.test(q) && !q.includes("gia von") && !q.includes("gia ban"));
  const forecastIntent = hasPhrase(q, ["du bao", "du doan", "tháng tới", "thang toi", "tuan toi", "ky toi", "forecast", "predict", "tuong lai"]);
  const diagnosisIntent = hasPhrase(q, ["tai sao", "nguyen nhan", "de xuat", "khuyen nghi", "can lam gi", "nen lam gi", "bat thuong"]);
  const inventoryIntent = hasToken(q, ["ton", "inventory"]) || hasPhrase(q, ["ton kho", "am kho", "het kho", "kho hang", "nguyen lieu", "het hang", "sap het"]);
  const comparisonIntent = hasPhrase(q, ["so sanh", "ky truoc", "so voi"]) || hasToken(q, ["tang", "giam", "compare"]);
  const categoryIntent = hasPhrase(q, ["nhom mon", "danh muc"]) || hasToken(q, ["category"]);
  const channelIntent = hasPhrase(q, ["kenh ban"]) || hasToken(q, ["kenh", "grab", "shopee", "channel"]);
  const productIntent = hasPhrase(q, ["ban chay", "lai cao", "lai thap"]) || hasToken(q, ["mon", "san", "pham", "top"]);
  const trendIntent = hasPhrase(q, ["xu huong", "theo ngay", "theo gio", "bien dong", "bieu do"])
    || hasToken(q, ["trend", "chart"]);
  const metricIntent = hasToken(q, ["doanh", "thu", "loi", "nhuan", "don", "cogs", "margin", "tien", "giavon"])
    || hasPhrase(q, ["gia von", "gia ban", "so tien", "nhieu tien"]);
  // "Giá X thế nào" không rõ là giá vốn (metric) hay giá thị trường (web) → mơ hồ
  const priceAmbiguity = /^gia\b/.test(q)
    && !q.includes("gia vang")
    && !q.includes("gia ca")
    && !q.includes("gia ban")
    && !q.includes("gia von")
    && !q.includes("gia nhap");

  if (mode === "dashboard" || isDashboardIntent(question)) {
    return [{ intent: "dashboard", confidence: 0.99 }];
  }
  if (isGreeting) scores.push({ intent: "greeting", confidence: 0.99 });
  if (documentIntent) scores.push({ intent: "document_search", confidence: 0.96 });
  if (hasPhrase(q, ["tom tat cuoc tro chuyen", "tom tat hoi thoai", "ket luan chinh"])) {
    scores.push({ intent: "conversation_summary", confidence: 0.94 });
  }
  if (webIntent && !priceAmbiguity) scores.push({ intent: "web_search", confidence: 0.9 });
  if (priceAmbiguity) {
    scores.push({ intent: "web_search", confidence: 0.62 });
    scores.push({ intent: "metric_lookup", confidence: 0.6 });
  }
  if (forecastIntent) scores.push({ intent: "forecast", confidence: 0.92 });
  if (diagnosisIntent) scores.push({ intent: "diagnosis", confidence: 0.95 }); // ưu tiên hơn comparison/trend
  if (inventoryIntent) scores.push({ intent: "inventory_risk", confidence: 0.94 });
  if (comparisonIntent) scores.push({ intent: "comparison", confidence: 0.92 });
  if (categoryIntent) scores.push({ intent: "category_analysis", confidence: 0.9 });
  if (channelIntent) scores.push({ intent: "channel_analysis", confidence: 0.92 });
  if (productIntent) scores.push({ intent: "product_ranking", confidence: 0.88 });
  if (trendIntent) scores.push({ intent: "trend", confidence: 0.9 });
  if (metricIntent) scores.push({ intent: "metric_lookup", confidence: 0.84 });

  return scores.sort((a, b) => b.confidence - a.confidence);
}

/** Lấy top-k intent để detect ambiguity — chỉ cho câu không có intent rõ ràng */
export function intentCandidatesFor(question: string, mode: "chat" | "dashboard") {
  return scoreIntents(question, mode);
}

function toolsForIntent(intent: AiIntent): AiToolName[] {
  const tools: Record<AiIntent, AiToolName[]> = {
    greeting: [],
    metric_lookup: ["sales_summary"],
    trend: ["sales_summary", "sales_timeseries"],
    comparison: ["sales_summary", "period_comparison"],
    product_ranking: ["sales_summary", "top_products"],
    category_analysis: ["sales_summary", "category_summary"],
    channel_analysis: ["sales_summary", "channel_summary"],
    inventory_risk: ["inventory_risk"],
    document_search: ["search_documents"],
    web_search: ["search_web"],
    forecast: ["sales_summary", "sales_timeseries", "forecast_revenue"],
    dashboard: ["sales_summary", "sales_timeseries", "period_comparison", "top_products", "category_summary", "channel_summary"],
    diagnosis: ["sales_summary", "sales_timeseries", "period_comparison", "top_products", "channel_summary"],
    conversation_summary: ["sales_summary", "top_products", "channel_summary"],
    out_of_scope: [],
  };
  return tools[intent];
}

export function buildAiPlan(
  question: string,
  mode: "chat" | "dashboard",
  now = new Date(),
  previousUserQuestions: string[] = [],
  timezone = "Asia/Ho_Chi_Minh",
  state?: { lastRange?: AiDateRange; lastMetric?: { key: string; version: string } } | null,
): AiPlan {
  const normalizedQuestion = normalizeIntentText(question);
  const hasCurrentDateContext = /hom nay|hom qua|tuan nay|tuan truoc|thang nay|thang truoc|\d{1,3}\s*ngay|today|yesterday|this (week|month)|last (week|month)/i.test(normalizedQuestion);
  const inheritedDateQuestion = hasCurrentDateContext
    ? ""
    : [...previousUserQuestions].reverse().find((item) =>
      /hom nay|hom qua|tuan nay|tuan truoc|thang nay|thang truoc|\d{1,3}\s*ngay|today|yesterday|this (week|month)|last (week|month)/i.test(normalizeIntentText(item)),
    ) ?? "";
  // Structured state: follow-up không có mốc thời gian → kế thừa range từ lần trước
  let range: AiDateRange;
  if (hasCurrentDateContext) {
    range = inferAiDateRange(question, now, timezone);
  } else if (state?.lastRange) {
    range = state.lastRange;
  } else {
    range = inferAiDateRange(`${question} ${inheritedDateQuestion}`, now, timezone);
  }
  const classification = inferIntent(question, mode);
  const candidates = scoreIntents(question, mode).slice(0, 3);
  const clarification = detectIntentAmbiguity(
    candidates.map((candidate) => ({ intent: candidate.intent, confidence: candidate.confidence })),
  );
  const tools = buildToolsForPlan(classification.intent, question, range, timezone);
  return {
    intent: classification.intent,
    intentConfidence: classification.confidence,
    modelTier: classification.modelTier,
    deterministic: classification.deterministic,
    rationale: classification.rationale,
    range,
    tools,
    semanticQuery: buildSemanticQueryMeta(classification.intent, question, range, timezone),
    ...(clarification ? { clarification } : {}),
  };
}

function buildSemanticQueryMeta(
  intent: AiIntent,
  question: string,
  range: AiDateRange,
  timezone: string,
): AiPlan["semanticQuery"] {
  // Resolve metric thực tế từ câu hỏi qua catalog alias (net_profit, total_orders, cost_of_goods...)
  const resolved = resolveMetricFromText(question);
  const query = semanticQueryForIntent(
    intent,
    range,
    timezone,
    question,
    resolved?.key ?? "net_revenue",
    resolved?.version ?? "1.0.0",
  );
  if (!query) return undefined;
  return {
    metric: query.metric,
    metricVersion: query.metricVersion,
    dimensions: query.dimensions,
    grain: query.grain,
    comparison: query.comparison,
  };
}

/**
 * Sinh tool calls cho một intent.
 * - Intent analytics (metric_lookup, trend, comparison, product_ranking,
 *   category_analysis, channel_analysis) → compile từ semantic query
 *   (metric catalog + dimension/grain).
 * - Intent khác (dashboard, diagnosis, forecast, document, web, inventory,
 *   greeting, out_of_scope, conversation_summary) → giữ map toolsForIntent cũ.
 */
function buildToolsForPlan(
  intent: AiIntent,
  question: string,
  range: AiDateRange,
  timezone: string,
): AiToolCall[] {
  const analyticsIntents: AiIntent[] = [
    "metric_lookup",
    "trend",
    "comparison",
    "product_ranking",
    "category_analysis",
    "channel_analysis",
  ];
  if (analyticsIntents.includes(intent)) {
    const query = semanticQueryForIntent(intent, range, timezone, question);
    if (query) {
      return compileSemanticQuery(query).map((call, index) => ({ ...call, id: `tool-${index + 1}` }));
    }
  }
  return toolsForIntent(intent).map((name, index) => {
    const common = { from: range.from, to: range.to, rangeLabel: range.label, timezone };
    const argumentsByTool: Record<AiToolName, Record<string, string | number | boolean | null>> = {
      sales_summary: common,
      sales_timeseries: { ...common, granularity: chooseGranularity(range, question) },
      top_products: { ...common, limit: 10 },
      category_summary: { ...common, limit: 20 },
      channel_summary: common,
      period_comparison: common,
      inventory_risk: { status: "attention" },
      search_documents: { query: question, limit: 6 },
      search_web: { query: question, limit: 5 },
      forecast_revenue: { ...common, horizon_days: 30 },
    };
    return {
      id: `tool-${index + 1}`,
      name,
      arguments: argumentsByTool[name],
    };
  });
}

/**
 * Async variant of buildAiPlan. Uses the LLM to decide intent + date range in
 * ONE call (smarter, understands paraphrase). Falls back to regex heuristics
 * when the model is unavailable (no key, timeout, circuit open).
 */
export async function buildAiPlanAsync(
  question: string,
  mode: "chat" | "dashboard",
  now = new Date(),
  previousUserQuestions: string[] = [],
  timezone = "Asia/Ho_Chi_Minh",
  state?: { lastRange?: AiDateRange; lastMetric?: { key: string; version: string } } | null,
): Promise<AiPlan> {
  const fallback = buildAiPlan(question, mode, now, previousUserQuestions, timezone, state);

  const { planWithLlm } = await import("@/lib/ai/llm-planner");
  const llmPlan = await planWithLlm(question, mode, now, timezone).catch(() => null);
  if (!llmPlan) return fallback;

  const llmRange = {
    from: llmPlan.from,
    to: llmPlan.to,
    label: llmPlan.rangeLabel,
  };
  const range = {
    from: llmRange.from,
    to: llmRange.to,
    label: llmRange.label,
  };
  const tools = buildToolsForPlan(llmPlan.intent, question, range, timezone);

  const deterministic = llmPlan.intent === "greeting";
  return {
    intent: llmPlan.intent,
    intentConfidence: llmPlan.confidence,
    modelTier: deterministic ? "none" : "fast",
    deterministic,
    rationale: llmPlan.rationale || `LLM lập kế hoạch: ${llmPlan.intent}`,
    range,
    tools,
    semanticQuery: buildSemanticQueryMeta(llmPlan.intent, question, range, timezone),
  };
}

export function planAnalyticsTools(
  question: string,
  mode: "chat" | "dashboard",
  now = new Date(),
  previousUserQuestions: string[] = [],
  timezone = "Asia/Ho_Chi_Minh",
  state?: { lastRange?: AiDateRange; lastMetric?: { key: string; version: string } } | null,
): AiToolCall[] {
  return buildAiPlan(question, mode, now, previousUserQuestions, timezone, state).tools;
}
