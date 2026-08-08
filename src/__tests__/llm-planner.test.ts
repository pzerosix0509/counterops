import { afterEach, describe, expect, it, vi } from "vitest";
import { planWithLlm } from "@/lib/ai/llm-planner";

const originalKey = process.env.NVIDIA_API_KEY;
const originalModel = process.env.AI_FAST_MODEL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env.NVIDIA_API_KEY;
  else process.env.NVIDIA_API_KEY = originalKey;
  if (originalModel === undefined) delete process.env.AI_FAST_MODEL;
  else process.env.AI_FAST_MODEL = originalModel;
});

describe("planWithLlm", () => {
  it("returns null when no provider key", async () => {
    delete process.env.NVIDIA_API_KEY;
    const result = await planWithLlm("doanh thu tháng này?", "chat", new Date("2026-08-08T12:00:00+07:00"));
    expect(result).toBeNull();
  });

  it("returns null for dashboard mode (always deterministic)", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    const result = await planWithLlm("tạo dashboard", "dashboard", new Date("2026-08-08T12:00:00+07:00"));
    expect(result).toBeNull();
  });

  it("parses LLM JSON into intent + range", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: "web_search",
              confidence: 0.9,
              rationale: "hỏi giá vàng",
              from: "2026-08-08T00:00:00.000Z",
              to: "2026-08-08T23:59:59.999Z",
              label: "Hôm nay",
            }),
          },
        }],
      }),
    }));
    const result = await planWithLlm("giá vàng hôm nay?", "chat", new Date("2026-08-08T12:00:00+07:00"));
    expect(result).toEqual({
      intent: "web_search",
      confidence: 0.9,
      rationale: "hỏi giá vàng",
      from: "2026-08-08T00:00:00.000Z",
      to: "2026-08-08T23:59:59.999Z",
      rangeLabel: "Hôm nay",
    });
  });

  it("falls back to regex range when LLM range is invalid", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{
          message: {
            content: JSON.stringify({
              intent: "metric_lookup",
              confidence: 0.8,
              rationale: "doanh thu 1 tháng",
              from: "invalid",
              to: "invalid",
              label: "",
            }),
          },
        }],
      }),
    }));
    const result = await planWithLlm("doanh thu 1 tháng qua?", "chat", new Date("2026-08-08T12:00:00+07:00"));
    expect(result?.intent).toBe("metric_lookup");
    expect(result?.rangeLabel).toBe("1 tháng qua");
  });

  it("returns null when fetch fails", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const result = await planWithLlm("doanh thu?", "chat", new Date("2026-08-08T12:00:00+07:00"));
    expect(result).toBeNull();
  });
});
