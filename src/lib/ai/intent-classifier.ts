import { AiCircuitBreaker, runWithTimeout } from "@/lib/ai/circuit-breaker";
import type { AiIntent } from "@/types/ai";

export interface LlmIntentResult {
  intent: AiIntent;
  confidence: number;
  rationale: string;
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
  "dashboard",
  "diagnosis",
  "forecast",
  "conversation_summary",
  "out_of_scope",
];

const INTENT_DESCRIPTIONS: Record<AiIntent, string> = {
  greeting: "Lời chào, hỏi thăm, hỏi trợ lý là ai / làm được gì",
  metric_lookup: "Hỏi số liệu doanh thu, lợi nhuận, số đơn trong kỳ",
  trend: "Hỏi xu hướng, biến động theo thời gian, biểu đồ",
  comparison: "So sánh hai kỳ, tăng/giảm so với kỳ trước",
  product_ranking: "Xếp hạng món ăn, món bán chạy, lãi cao/thấp",
  category_analysis: "Phân tích theo nhóm món, danh mục",
  channel_analysis: "Phân tích theo kênh bán (Grab, Shopee, tại quán...)",
  inventory_risk: "Tồn kho, hết hàng, âm kho, nguyên liệu",
  document_search: "Tìm kiếm trong tài liệu đã upload",
  dashboard: "Yêu cầu tạo dashboard, bảng điều khiển, KPI",
  diagnosis: "Hỏi tại sao, nguyên nhân, đề xuất, khuyến nghị, bất thường",
  forecast: "Dự báo, dự đoán tương lai",
  conversation_summary: "Tóm tắt cuộc trò chuyện",
  out_of_scope: "Không liên quan dữ liệu kinh doanh của quán",
};

const BREAKER_KEY = Symbol.for("counterops.ai.intent-classifier-circuit-breaker");
const TIMEOUT_MS = 6_000;

function breaker() {
  const globalState = globalThis as typeof globalThis & {
    [BREAKER_KEY]?: AiCircuitBreaker;
  };
  if (!globalState[BREAKER_KEY]) {
    globalState[BREAKER_KEY] = new AiCircuitBreaker({
      failureThreshold: Number(process.env.AI_CLASSIFIER_CIRCUIT_FAILURE_THRESHOLD ?? 2),
      cooldownMs: Number(process.env.AI_CLASSIFIER_CIRCUIT_COOLDOWN_MS ?? 60_000),
    });
  }
  return globalState[BREAKER_KEY];
}

function providerConfig() {
  const apiKey = process.env.NVIDIA_API_KEY || process.env.MINIMAX_API_KEY || process.env.OPENAI_API_KEY;
  const baseUrl = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
  const model = process.env.AI_CLASSIFIER_MODEL
    || process.env.AI_FAST_MODEL
    || "minimaxai/minimax-m3";
  return { apiKey, baseUrl, model };
}

/**
 * Use the LLM to classify a question into an intent when keyword heuristics
 * are unsure (out_of_scope or low confidence). Returns null on any failure so
 * the caller can fall back to the deterministic classification.
 */
export async function classifyIntentWithLlm(question: string): Promise<LlmIntentResult | null> {
  const { apiKey, baseUrl, model } = providerConfig();
  if (!apiKey) return null;

  const circuit = breaker();
  const key = `${baseUrl}:${model}`;
  if (!circuit.canRequest(key)) return null;

  const prompt = [
    "Bạn là bộ phân loại ý định cho trợ lý phân tích dữ liệu quán cafe/nhà hàng.",
    `Các intent hợp lệ: ${VALID_INTENTS.map((i) => `${i} (${INTENT_DESCRIPTIONS[i]})`).join("; ")}.`,
    "Trả về JSON thuần: {\"intent\": \"<một intent>\", \"confidence\": <0-1>, \"rationale\": \"<lý do ngắn>\"}.",
    "Chọn out_of_scope nếu câu hỏi không liên quan dữ liệu kinh doanh.",
    `Câu hỏi: ${question}`,
  ].join("\n");

  try {
    const response = await runWithTimeout(TIMEOUT_MS, async (signal) => {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: 200,
          temperature: 0,
          stream: false,
        }),
        signal,
      });
      if (!res.ok) throw new Error(`Classifier HTTP ${res.status}`);
      return res.json();
    });
    const raw = response?.choices?.[0]?.message?.content ?? "";
    const parsed = JSON.parse(raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim()) as Partial<LlmIntentResult>;
    if (!parsed.intent || !VALID_INTENTS.includes(parsed.intent)) return null;
    return {
      intent: parsed.intent,
      confidence: Math.min(Math.max(Number(parsed.confidence ?? 0.5), 0), 1),
      rationale: String(parsed.rationale ?? "").slice(0, 300),
    };
  } catch {
    circuit.recordFailure(key);
    return null;
  }
}
