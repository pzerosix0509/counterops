import { afterEach, describe, expect, it, vi } from "vitest";
import { imageToText } from "@/lib/ai/image-to-text";

const originalKey = process.env.OPENAI_API_KEY;
const originalVision = process.env.AI_VISION_MODEL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalKey;
  if (originalVision === undefined) delete process.env.AI_VISION_MODEL;
  else process.env.AI_VISION_MODEL = originalVision;
});

describe("imageToText", () => {
  it("returns empty string when no OpenAI key is configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const result = await imageToText({ data: "abc", mime: "image/png" }, "câu hỏi");
    expect(result).toBe("");
  });

  it("calls vision model and returns extracted text", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.AI_VISION_MODEL = "gpt-4o-mini";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Hóa đơn 100k" } }] }),
    }));
    const result = await imageToText({ data: "abc", mime: "image/png" }, "đọc hóa đơn");
    expect(result).toBe("Hóa đơn 100k");
    const body = JSON.parse((fetch as any).mock.calls[0][1].body);
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.messages[0].content[1].image_url.url).toContain("data:image/png;base64,abc");
  });

  it("returns empty string when API errors", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const result = await imageToText({ data: "abc", mime: "image/jpeg" }, "câu hỏi");
    expect(result).toBe("");
  });

  it("returns empty string when fetch throws", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    const result = await imageToText({ data: "abc", mime: "image/webp" }, "câu hỏi");
    expect(result).toBe("");
  });
});
