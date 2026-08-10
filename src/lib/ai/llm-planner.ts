import { AiCircuitBreaker, runWithTimeout } from "@/lib/ai/circuit-breaker";
import { inferAiDateRange } from "@/lib/ai/semantic-layer";
import type { AiIntent } from "@/types/ai";

export interface LlmPlanResult {
  intent: AiIntent;
  confidence: number;
  rationale: string;
  rangeLabel: string;
  from: string;
  to: string;
}

const VALID_INTENTS: AiIntent[] = [
  "greeting",
  "metric_lookup",
  "trend",
  "comparison",
  "product_ranking",
  "category_analysis",
  "channel_analysis",
  "inventory_risk",
  "document_search",
  "web_search",
  "dashboard",
  "diagnosis",
  "forecast",
  "conversation_summary",
  "out_of_scope",
];

const INTENT_DESCRIPTIONS: Record<AiIntent, string> = {
  greeting: "Chào hỏi, hỏi trợ lý là ai / làm được gì",
  metric_lookup: "Hỏi số liệu doanh thu, lợi nhuận, số đơn trong kỳ",
  trend: "Hỏi xu hướng/biến động theo thời gian của DỮ LIỆU KINH DOANH (doanh thu theo ngày/tuần/tháng)",
  comparison: "So sánh hai kỳ, tăng/giảm so với kỳ trước",
  product_ranking: "Xếp hạng món ăn, món bán chạy, lãi cao/thấp",
  category_analysis: "Phân tích theo nhóm món, danh mục",
  channel_analysis: "Phân tích theo kênh bán (Grab, Shopee, tại quán...)",
  inventory_risk: "Tồn kho, hết hàng, âm kho, nguyên liệu",
  document_search: "Tìm kiếm trong tài liệu đã upload của quán",
  web_search: "Hỏi thông tin BÊN NGOÀI: giá vàng, thời tiết, tin tức, crypto, chứng khoán, thể thao, kiến thức chung, người nổi tiếng, xu hướng thị trường",
  dashboard: "Yêu cầu tạo dashboard, bảng điều khiển, KPI",
  diagnosis: "Hỏi tại sao, nguyên nhân, đề xuất, khuyến nghị, bất thường",
  forecast: "Dự báo/dự đoán DOANH THU tương lai của quán",
  conversation_summary: "Tóm tắt cuộc trò chuyện",
  out_of_scope: "Câu hỏi lạ, không liên quan dữ liệu kinh doanh, không cần web",
};

const BREAKER_KEY = Symbol.for("counterops.ai.llm-planner-circuit-breaker");
const TIMEOUT_MS = 10_000;

function breaker() {
  const globalState = globalThis as typeof globalThis & {
    [BREAKER_KEY]?: AiCircuitBreaker;
  };
  if (!globalState[BREAKER_KEY]) {
    globalState[BREAKER_KEY] = new AiCircuitBreaker({
      failureThreshold: Number(process.env.AI_PLANNER_CIRCUIT_FAILURE_THRESHOLD ?? 2),
      cooldownMs: Number(process.env.AI_PLANNER_CIRCUIT_COOLDOWN_MS ?? 60_000),
    });
  }
  return globalState[BREAKER_KEY];
}

function providerConfig() {
  const apiKey = process.env.NVIDIA_API_KEY || process.env.MINIMAX_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
  const model = process.env.AI_PLANNER_MODEL
    || process.env.AI_FAST_MODEL
    || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
  return { apiKey, baseUrl, model };
}

/**
 * Ask the LLM to decide intent + date range for a question in ONE call.
 * Returns null on any failure so callers fall back to regex heuristics.
 */
export async function planWithLlm(
  question: string,
  mode: "chat" | "dashboard",
  now: Date,
  timezone = "Asia/Ho_Chi_Minh",
): Promise<LlmPlanResult | null> {
  const { apiKey, baseUrl, model } = providerConfig();
  if (!apiKey) return null;
  if (mode === "dashboard") return null; // dashboard always deterministic

  const circuit = breaker();
  const key = `${baseUrl}:${model}`;
  if (!circuit.canRequest(key)) return null;

  const todayISO = now.toISOString();
  const prompt = [
    `Hôm nay là ${todayISO.slice(0, 10)} (múi giờ quán: ${timezone}). Bạn là bộ lập kế hoạch cho trợ lý phân tích quán cafe/nhà hàng.`,
    `Chọn ĐÚNG MỘT intent cho câu hỏi. Các intent:`,
    ...VALID_INTENTS.map((i) => `- ${i}: ${INTENT_DESCRIPTIONS[i]}`),
    "Quy tắc:",
    "- 'giá vàng', 'thời tiết', 'tin tức', 'thể thao', 'người nổi tiếng', 'xu hướng thị trường', 'crypto', 'chứng khoán' -> web_search (KHÔNG phải forecast/trend).",
    "- 'dự đoán doanh thu' -> forecast. 'xu hướng doanh thu' -> trend.",
    "- Hỏi về số liệu quán -> metric_lookup/trend/comparison...",
    "- Chào hỏi / hỏi trợ lý là ai -> greeting.",
    "- Kiến thức chung không cần tra web -> out_of_scope.",
    `Xác định khoảng thời gian phù hợp (from/to ISO, label tiếng Việt như 'Hôm nay', '7 ngày qua', 'Tháng này', '24 ngày qua'). Mặc định 7 ngày qua nếu không rõ.`,
    "Trả JSON thuần: {\"intent\":\"...\",\"confidence\":0.0-1.0,\"rationale\":\"...\",\"from\":\"ISO\",\"to\":\"ISO\",\"label\":\"...\"}",
    `Câu hỏi: ${question}`,
  ].join("\n");

  try {
    const response = await runWithTimeout(TIMEOUT_MS, async (signal) => {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 300,
          temperature: 0,
          stream: false,
        }),
        signal,
      });
      if (!res.ok) throw new Error(`Planner HTTP ${res.status}`);
      return res.json();
    });
    const raw = response?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()) as Partial<LlmPlanResult> & { label?: string };
    if (!parsed.intent || !VALID_INTENTS.includes(parsed.intent)) return null;

    // Validate range; fall back to regex-derived range if LLM range is invalid.
    let rangeLabel = parsed.rangeLabel ?? parsed.label ?? "";
    let from = parsed.from ?? "";
    let to = parsed.to ?? "";
    const validDate = (s: string) => !Number.isNaN(Date.parse(s));
    const rangeValid = validDate(from) && validDate(to) && Date.parse(from) <= Date.parse(to);
    if (!rangeValid || !rangeLabel) {
      const fallback = inferAiDateRange(question, now, timezone);
      rangeLabel = fallback.label;
      from = fallback.from;
      to = fallback.to;
    }

    circuit.recordSuccess(key);
    return {
      intent: parsed.intent,
      confidence: Math.min(Math.max(Number(parsed.confidence ?? 0.5), 0), 1),
      rationale: String(parsed.rationale ?? "").slice(0, 300),
      rangeLabel,
      from,
      to,
    };
  } catch {
    circuit.recordFailure(key);
    return null;
  }
}
