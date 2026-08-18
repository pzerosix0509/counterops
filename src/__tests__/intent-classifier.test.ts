import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyIntentWithLlm } from "@/lib/ai/intent-classifier";

const originalKey = process.env.NVIDIA_API_KEY;
const originalFast = process.env.AI_FAST_MODEL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env.NVIDIA_API_KEY;
  else process.env.NVIDIA_API_KEY = originalKey;
  if (originalFast === undefined) delete process.env.AI_FAST_MODEL;
  else process.env.AI_FAST_MODEL = originalFast;
});

describe("classifyIntentWithLlm", () => {
  it("returns null when no provider key is configured", async () => {
    delete process.env.NVIDIA_API_KEY;
    delete process.env.AI_FAST_MODEL;
    const result = await classifyIntentWithLlm("Bạn là ai?");
    expect(result).toBeNull();
  });

  it("parses the LLM JSON response into an intent", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    process.env.AI_FAST_MODEL = "minimaxai/minimax-m3";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"intent": "inventory_risk", "confidence": 0.9, "rationale": "hỏi kho"}' } }],
      }),
    }));
    const result = await classifyIntentWithLlm("Kho còn bao nhiêu?");
    expect(result).toEqual({ intent: "inventory_risk", confidence: 0.9, rationale: "hỏi kho" });
  });

  it("returns null when the model returns an invalid intent", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    process.env.AI_FAST_MODEL = "minimaxai/minimax-m3";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"intent": "not_real", "confidence": 0.9}' } }],
      }),
    }));
    const result = await classifyIntentWithLlm("Kho còn bao nhiêu?");
    expect(result).toBeNull();
  });

  it("returns null when fetch fails", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const result = await classifyIntentWithLlm("Bạn là ai?");
    expect(result).toBeNull();
  });

  it("accepts the sentiment intent from the model", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    process.env.AI_FAST_MODEL = "minimaxai/minimax-m3";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"intent": "sentiment", "confidence": 0.95, "rationale": "hỏi cảm xúc"}' } }],
      }),
    }));
    const result = await classifyIntentWithLlm("Phản hồi khách tích cực hay tiêu cực?");
    expect(result).toEqual({ intent: "sentiment", confidence: 0.95, rationale: "hỏi cảm xúc" });
  });
});
