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

function startOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(0, 0, 0, 0);
  return value;
}

function endOfDay(date: Date) {
  const value = new Date(date);
  value.setHours(23, 59, 59, 999);
  return value;
}

export function inferAiDateRange(question: string, now = new Date()): AiDateRange {
  const q = normalizeIntentText(question);
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);

  if (q.includes("hom qua") || q.includes("yesterday")) {
    const date = new Date(now);
    date.setDate(date.getDate() - 1);
    return { from: startOfDay(date).toISOString(), to: endOfDay(date).toISOString(), label: "Hôm qua" };
  }

  if (q.includes("hom nay") || q.includes("today")) {
    return { from: todayStart.toISOString(), to: todayEnd.toISOString(), label: "Hôm nay" };
  }

  if (q.includes("thang truoc") || q.includes("last month")) {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    return { from: from.toISOString(), to: to.toISOString(), label: "Tháng trước" };
  }

  if (q.includes("thang nay") || q.includes("this month")) {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: from.toISOString(), to: todayEnd.toISOString(), label: "Tháng này" };
  }

  if (q.includes("tuan truoc") || q.includes("last week")) {
    const day = now.getDay() || 7;
    const currentMonday = startOfDay(now);
    currentMonday.setDate(currentMonday.getDate() - day + 1);
    const from = new Date(currentMonday);
    from.setDate(from.getDate() - 7);
    const to = new Date(currentMonday.getTime() - 1);
    return { from: from.toISOString(), to: to.toISOString(), label: "Tuần trước" };
  }

  if (q.includes("tuan nay") || q.includes("this week")) {
    const day = now.getDay() || 7;
    const from = startOfDay(now);
    from.setDate(from.getDate() - day + 1);
    return { from: from.toISOString(), to: todayEnd.toISOString(), label: "Tuần này" };
  }

  const explicitDays = q.match(/(\d{1,3})\s*ngay/);
  const days = Math.min(Math.max(Number(explicitDays?.[1] ?? 7), 1), 366);
  const from = startOfDay(now);
  from.setDate(from.getDate() - (days - 1));
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
  const q = normalizeIntentText(question);
  const isGreeting = /^(hi|hello|chao|xin chao|hey|m la ai|m là ai|m lam duoc gi|m làm được gì|ban la ai|ban lam duoc gi|ban co the giup|cam on|thank)\b/.test(q)
    || hasPhrase(q, ["giup minh", "giup toi", "lam duoc gi", "co the lam gi", "tinh nang gi", "ban la ai", "m giup", "m la ai"]);
  const documentIntent = hasPhrase(q, ["tai lieu", "da upload", "quy dinh", "huong dan", "document"]);

  if (mode === "dashboard" || isDashboardIntent(question)) {
    return { intent: "dashboard", confidence: 0.99, modelTier: "none", deterministic: true, rationale: "Yêu cầu trực quan hóa có cấu trúc." };
  }
  if (isGreeting) {
    return { intent: "greeting", confidence: 0.99, modelTier: "none", deterministic: true, rationale: "Lời chào không cần truy vấn dữ liệu." };
  }
  if (documentIntent) {
    return { intent: "document_search", confidence: 0.96, modelTier: "fast", deterministic: false, rationale: "Câu hỏi yêu cầu tra cứu tài liệu." };
  }
  if (hasPhrase(q, ["tom tat cuoc tro chuyen", "tom tat hoi thoai", "ket luan chinh"])) {
    return { intent: "conversation_summary", confidence: 0.94, modelTier: "quality", deterministic: false, rationale: "Yêu cầu tổng hợp nhiều lượt hội thoại." };
  }
  if (hasPhrase(q, ["du bao", "du doan", "tháng tới", "thang toi", "tuan toi", "ky toi", "forecast", "predict", "tuong lai"])) {
    return { intent: "forecast", confidence: 0.92, modelTier: "fast", deterministic: false, rationale: "Yêu cầu dự báo hoặc dự đoán tương lai." };
  }
  if (hasPhrase(q, ["tai sao", "nguyen nhan", "de xuat", "khuyen nghi", "can lam gi", "nen lam gi", "bat thuong"])) {
    return { intent: "diagnosis", confidence: 0.9, modelTier: "quality", deterministic: false, rationale: "Yêu cầu suy luận nguyên nhân hoặc khuyến nghị." };
  }
  if (hasToken(q, ["kho", "ton", "inventory"]) || hasPhrase(q, ["nguyen lieu", "het hang", "am kho", "sap het"])) {
    return { intent: "inventory_risk", confidence: 0.94, modelTier: "none", deterministic: true, rationale: "Yêu cầu trạng thái hoặc rủi ro tồn kho." };
  }
  if (hasPhrase(q, ["so sanh", "ky truoc"]) || hasToken(q, ["tang", "giam", "compare"])) {
    return { intent: "comparison", confidence: 0.92, modelTier: "none", deterministic: true, rationale: "Yêu cầu so sánh hai kỳ." };
  }
  if (hasPhrase(q, ["nhom mon", "danh muc"]) || hasToken(q, ["category"])) {
    return { intent: "category_analysis", confidence: 0.9, modelTier: "none", deterministic: true, rationale: "Yêu cầu phân tích theo nhóm món." };
  }
  if (hasPhrase(q, ["kenh ban"]) || hasToken(q, ["kenh", "grab", "shopee", "channel"])) {
    return { intent: "channel_analysis", confidence: 0.92, modelTier: "none", deterministic: true, rationale: "Yêu cầu phân tích theo kênh bán." };
  }
  if (hasPhrase(q, ["ban chay", "lai cao", "lai thap"]) || hasToken(q, ["mon", "san", "pham", "top"])) {
    return { intent: "product_ranking", confidence: 0.88, modelTier: "none", deterministic: true, rationale: "Yêu cầu xếp hạng món hoặc sản phẩm." };
  }
  if (
    hasPhrase(q, ["tim kiem web", "tra cuu web", "thong tin tren web", "tin tuc", "gia vang", "thoi tiet", "bitcoin", "crypto", "chung khoan", "web search"])
    || /^(gia|thoi tiet|bitcoin|crypto|chung khoan|thoi tiet)\b/.test(q)
  ) {
    return { intent: "web_search", confidence: 0.9, modelTier: "fast", deterministic: false, rationale: "Yêu cầu tìm kiếm thông tin bên ngoài trên web." };
  }
  if (
    hasPhrase(q, ["xu huong", "theo ngay", "theo gio", "bien dong", "bieu do"])
    || hasToken(q, ["trend", "chart"])
  ) {
    return { intent: "trend", confidence: 0.9, modelTier: "none", deterministic: true, rationale: "Yêu cầu chuỗi thời gian." };
  }
  if (hasToken(q, ["doanh", "thu", "loi", "nhuan", "don", "cogs", "margin"])) {
    return { intent: "metric_lookup", confidence: 0.84, modelTier: "none", deterministic: true, rationale: "Yêu cầu tra cứu chỉ số kinh doanh." };
  }
  return {
    intent: "out_of_scope",
    confidence: 0.72,
    modelTier: "fast",
    deterministic: false,
    rationale: "Câu hỏi không thuộc dữ liệu kinh doanh — dùng mô hình để trả lời tự nhiên.",
  };
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
): AiPlan {
  const normalizedQuestion = normalizeIntentText(question);
  const hasCurrentDateContext = /hom nay|hom qua|tuan nay|tuan truoc|thang nay|thang truoc|\d{1,3}\s*ngay|today|yesterday|this (week|month)|last (week|month)/i.test(normalizedQuestion);
  const inheritedDateQuestion = hasCurrentDateContext
    ? ""
    : [...previousUserQuestions].reverse().find((item) =>
      /hom nay|hom qua|tuan nay|tuan truoc|thang nay|thang truoc|\d{1,3}\s*ngay|today|yesterday|this (week|month)|last (week|month)/i.test(normalizeIntentText(item)),
    ) ?? "";
  const range = inferAiDateRange(`${question} ${inheritedDateQuestion}`, now);
  const classification = inferIntent(question, mode);
  const tools = toolsForIntent(classification.intent).map((name, index) => {
    const common = { from: range.from, to: range.to, rangeLabel: range.label };
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
  return {
    intent: classification.intent,
    intentConfidence: classification.confidence,
    modelTier: classification.modelTier,
    deterministic: classification.deterministic,
    rationale: classification.rationale,
    range,
    tools,
  };
}

/**
 * Async variant of buildAiPlan. When keyword heuristics are unsure
 * (out_of_scope or confidence < 0.6), asks the LLM to classify the intent so
 * ambiguous questions still get a smart response. Falls back to the
 * deterministic plan when the classifier is unavailable.
 */
export async function buildAiPlanAsync(
  question: string,
  mode: "chat" | "dashboard",
  now = new Date(),
  previousUserQuestions: string[] = [],
): Promise<AiPlan> {
  const plan = buildAiPlan(question, mode, now, previousUserQuestions);
  const shouldClassify = plan.intent === "out_of_scope" || plan.intentConfidence < 0.6;
  if (!shouldClassify) return plan;

  const { classifyIntentWithLlm } = await import("@/lib/ai/intent-classifier");
  const llmResult = await classifyIntentWithLlm(question).catch(() => null);
  if (!llmResult || llmResult.intent === plan.intent) return plan;

  // Greeting stays deterministic (no model call). Other intents — including
  // out_of_scope — use the model to answer naturally.
  const tools = toolsForIntent(llmResult.intent).map((name, index) => {
    const common = { from: plan.range.from, to: plan.range.to, rangeLabel: plan.range.label };
    const argumentsByTool: Record<AiToolName, Record<string, string | number | boolean | null>> = {
      sales_summary: common,
      sales_timeseries: { ...common, granularity: chooseGranularity(plan.range, question) },
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
  const deterministic = llmResult.intent === "greeting";
  return {
    ...plan,
    intent: llmResult.intent,
    intentConfidence: llmResult.confidence,
    modelTier: deterministic ? "none" : "fast",
    deterministic,
    rationale: llmResult.rationale || `LLM phân loại: ${llmResult.intent}`,
    tools,
  };
}

export function planAnalyticsTools(
  question: string,
  mode: "chat" | "dashboard",
  now = new Date(),
  previousUserQuestions: string[] = [],
): AiToolCall[] {
  return buildAiPlan(question, mode, now, previousUserQuestions).tools;
}
