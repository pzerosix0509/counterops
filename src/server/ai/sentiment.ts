import "server-only";
import { AiCircuitBreaker, runWithTimeout } from "@/lib/ai/circuit-breaker";
import { parseSentimentLlmJson, type SentimentScore } from "@/lib/analytics/sentiment";
import { extractAiOutputText, listAiProviderConfigs } from "@/server/ai/provider";

const BREAKER_KEY = Symbol.for("counterops.ai.sentiment-circuit-breaker");
export const SENTIMENT_CONCURRENCY = 3;

const sentimentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["label", "score"],
  properties: {
    label: { type: "string", enum: ["positive", "neutral", "negative"] },
    score: { type: "number", minimum: 0, maximum: 1 },
  },
} as const;

export type ScoredFeedback = SentimentScore & { modelName: string };

function circuitBreaker() {
  const globalState = globalThis as typeof globalThis & {
    [BREAKER_KEY]?: AiCircuitBreaker;
  };
  if (!globalState[BREAKER_KEY]) {
    globalState[BREAKER_KEY] = new AiCircuitBreaker({
      failureThreshold: Number(process.env.AI_CIRCUIT_FAILURE_THRESHOLD ?? 2),
      cooldownMs: Number(process.env.AI_CIRCUIT_COOLDOWN_MS ?? 60_000),
    });
  }
  return globalState[BREAKER_KEY];
}

function sentimentMessages(feedbackText: string) {
  return [
    {
      role: "system",
      content: [
        "Bạn chỉ phân tích cảm xúc của văn bản tiếng Việt.",
        "Không dùng điểm rating, sao, hay bất kỳ metadata nào ngoài văn bản.",
        "score là độ chắc của nhãn (0-1), không phải điểm đánh giá.",
        'Trả đúng một JSON object { "label": "positive"|"neutral"|"negative", "score": number }.',
        "Không thêm markdown fence.",
      ].join("\n"),
    },
    {
      role: "user",
      content: `feedback_text:\n${feedbackText}`,
    },
  ];
}

function parseSentimentText(text: string): SentimentScore | null {
  const raw = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  if (!raw) return null;
  try {
    return parseSentimentLlmJson(JSON.parse(raw));
  } catch {
    return null;
  }
}

async function postSentiment(
  config: ReturnType<typeof listAiProviderConfigs>[number],
  feedbackText: string,
  signal: AbortSignal,
): Promise<{ score: SentimentScore | null; error?: string }> {
  const messages = sentimentMessages(feedbackText);
  const maxTokens = Number(process.env.AI_FAST_MAX_TOKENS ?? 200);
  const sendChat = (body: Record<string, unknown>) => fetch(
    `${config.baseUrl.replace(/\/$/, "")}/chat/completions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    },
  );

  const response = config.protocol === "responses"
    ? await fetch(`${config.baseUrl}/responses`, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        input: messages,
        temperature: 0,
        max_output_tokens: maxTokens,
        text: {
          format: {
            type: "json_schema",
            name: "sentiment_score",
            strict: true,
            schema: sentimentJsonSchema,
          },
        },
      }),
      signal,
    })
    : await (async () => {
      const body = {
        model: config.model,
        messages,
        max_tokens: maxTokens,
        temperature: 0,
        stream: false,
      };
      let next = await sendChat({ ...body, response_format: { type: "json_object" } });
      if (next.status === 400 && !signal.aborted) next = await sendChat(body);
      return next;
    })();

  if (!response.ok) {
    return { score: null, error: `${config.provider} HTTP ${response.status}` };
  }
  const payload = await response.json();
  return { score: parseSentimentText(extractAiOutputText(payload)) };
}

export async function scoreFeedbackText(text: string): Promise<ScoredFeedback | null> {
  const feedbackText = text.trim();
  if (!feedbackText) return null;

  const configs = listAiProviderConfigs("fast");
  if (configs.length === 0) return null;

  const breaker = circuitBreaker();
  const timeoutMs = Number(process.env.AI_PROVIDER_TIMEOUT_MS ?? 30_000);

  for (const config of configs) {
    const key = `${config.provider}:${config.model}:${config.baseUrl}`;
    if (!breaker.canRequest(key)) continue;

    try {
      const result = await runWithTimeout(timeoutMs, (signal) =>
        postSentiment(config, feedbackText, signal),
      );
      if (result.score) {
        breaker.recordSuccess(key);
        return {
          ...result.score,
          modelName: `${config.provider}/${config.model}`,
        };
      }
      breaker.recordFailure(key);
    } catch {
      breaker.recordFailure(key);
    }
  }

  return null;
}
