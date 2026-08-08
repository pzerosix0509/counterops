import { afterEach, describe, expect, it, vi } from "vitest";
import { imageToText } from "@/lib/ai/image-to-text";

const originalKey = process.env.NVIDIA_API_KEY;
const originalVision = process.env.AI_VISION_MODEL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalKey === undefined) delete process.env.NVIDIA_API_KEY;
  else process.env.NVIDIA_API_KEY = originalKey;
  if (originalVision === undefined) delete process.env.AI_VISION_MODEL;
  else process.env.AI_VISION_MODEL = originalVision;
});

describe("imageToText", () => {
  it("throws when no NVIDIA key is configured", async () => {
    delete process.env.NVIDIA_API_KEY;
    await expect(imageToText({ data: "abc", mime: "image/png" }, "câu hỏi"))
      .rejects.toThrow("Thiếu NVIDIA_API_KEY");
  });

  it("calls NVIDIA vision model and returns extracted text", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    process.env.AI_VISION_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "Hóa đơn 100k" } }] }),
    }));
    const result = await imageToText({ data: "abc", mime: "image/png" }, "đọc hóa đơn");
    expect(result).toBe("Hóa đơn 100k");
    const [url, options] = (fetch as any).mock.calls[0];
    expect(url).toContain("integrate.api.nvidia.com");
    const body = JSON.parse(options.body);
    expect(body.model).toBe("nvidia/nemotron-3-nano-omni-30b-a3b-reasoning");
    expect(body.stream).toBe(false);
    expect(body.messages[0].content[1].image_url.url).toContain("data:image/png;base64,abc");
  });

  it("parses array content parts", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: [{ type: "text", text: "A" }, { type: "text", text: "B" }] } }],
      }),
    }));
    const result = await imageToText({ data: "abc", mime: "image/png" }, "đọc");
    expect(result).toBe("A B");
  });

  it("throws when API errors", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    await expect(imageToText({ data: "abc", mime: "image/jpeg" }, "câu hỏi"))
      .rejects.toThrow("NVIDIA vision trả lỗi HTTP 500.");
  });

  it("throws when fetch throws", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    await expect(imageToText({ data: "abc", mime: "image/webp" }, "câu hỏi"))
      .rejects.toThrow("network");
  });
});
