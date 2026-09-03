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

describe("isGenericImageQuestion", () => {
  it("detects generic image upload phrases", async () => {
    const { isGenericImageQuestion } = await import("@/lib/ai/semantic-layer");
    expect(isGenericImageQuestion("[Xem ảnh đính kèm]")).toBe(true);
    expect(isGenericImageQuestion("[Ảnh đã gửi]")).toBe(true);
    expect(isGenericImageQuestion("")).toBe(true);
    expect(isGenericImageQuestion("   ")).toBe(true);
    expect(isGenericImageQuestion("xem ảnh")).toBe(true);
    expect(isGenericImageQuestion("tóm tắt ảnh")).toBe(true);
    expect(isGenericImageQuestion("ảnh này nói gì")).toBe(true);
    expect(isGenericImageQuestion("Doanh thu hôm nay là bao nhiêu?")).toBe(false);
    expect(isGenericImageQuestion("Món nào bán chạy nhất?")).toBe(false);
  });
});

describe("buildFallbackAnswer with imageSource", () => {
  it("summarizes imageSource instead of returning sales summary", async () => {
    const { buildFallbackAnswer, buildAnalyticsContext } = await import("@/server/ai/analytics");
    const analytics = buildAnalyticsContext([]);
    const imageSource = {
      id: "IMG1",
      label: "Ảnh người dùng gửi",
      type: "document" as const,
      detail: "Văn bản trích từ ảnh đính kèm",
      excerpt: "Anomalies: Insertion anomaly, Deletion anomaly. Normal forms: 1NF, 2NF.",
      meta: { tool: "image_to_text" as const, source: "attachment" as const },
    };
    const result = buildFallbackAnswer("[Xem ảnh đính kèm]", analytics, [imageSource]);
    expect(result.answer).toContain("Anomalies: Insertion anomaly");
    expect(result.answer).not.toContain("doanh thu");
    expect(result.bullets[0]).toContain("Nội dung tóm tắt từ ảnh đính kèm [IMG1]");
  });

  it("handles empty excerpt gracefully in fallback", async () => {
    const { buildFallbackAnswer, buildAnalyticsContext } = await import("@/server/ai/analytics");
    const analytics = buildAnalyticsContext([]);
    const imageSource = {
      id: "IMG1",
      label: "Ảnh người dùng gửi",
      type: "document" as const,
      detail: "Văn bản trích từ ảnh đính kèm",
      excerpt: "",
      meta: { tool: "image_to_text" as const, source: "attachment" as const },
    };
    const result = buildFallbackAnswer("[Xem ảnh đính kèm]", analytics, [imageSource]);
    expect(result.bullets[1]).toBe("Không trích xuất được nội dung từ ảnh.");
  });
});

describe("generateAiModelAnswer with imageText", () => {
  it("includes image summary instruction in system prompt and sends image text to model", async () => {
    process.env.NVIDIA_API_KEY = "test-key";
    let capturedBody: any = null;
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string, opts: any) => {
      capturedBody = JSON.parse(opts.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  answer: "Tài liệu nói về các bất thường dữ liệu và chuẩn 1NF, 2NF [IMG1].",
                  bullets: ["Bất thường chèn, xóa, sửa", "Chuẩn 1NF, 2NF"],
                  dashboard: null,
                }),
              },
            },
          ],
        }),
      });
    }));

    const { generateAiModelAnswer } = await import("@/server/ai/provider");
    const result = await generateAiModelAnswer({
      question: "[Xem ảnh đính kèm]",
      mode: "chat",
      intent: "document_search",
      sources: [
        {
          id: "IMG1",
          label: "Ảnh người dùng gửi",
          type: "document",
          detail: "Văn bản trích từ ảnh đính kèm",
          excerpt: "Anomalies: Insertion anomaly. 1NF, 2NF.",
          meta: { tool: "image_to_text", source: "attachment" },
        },
      ],
      executions: [],
      memory: {
        summary: null,
        turns: [
          { role: "user", content: "Doanh thu 7 ngày qua thế nào?" },
          { role: "assistant", content: "Doanh thu thuần: 9.462.000 đ [S1]." },
        ],
      },
      confidence: {
        score: 0.95,
        level: "high",
        reasons: ["ok"],
        sampleSize: null,
        components: { query: 1, dataCompleteness: 1, consistency: 1, analysisFit: 1, forecastReliability: null },
      },
      qualityIssues: [],
      anomalies: [],
      imageText: "Anomalies: Insertion anomaly. 1NF, 2NF.",
      timezone: "Asia/Ho_Chi_Minh",
    }, "fast");

    expect(result.answer?.answer).toContain("Tài liệu nói về các bất thường dữ liệu");
    expect(result.answer?.bullets).toHaveLength(2);

    // Verify system prompt contains image-to-text instructions
    const systemMessage = capturedBody.messages.find((m: any) => m.role === "system");
    expect(systemMessage.content).toContain("Người dùng đã gửi một hình ảnh đính kèm");
    expect(systemMessage.content).toContain("TUYỆT ĐỐI KHÔNG tự ý lấy số liệu bán hàng");

    // Verify user message does not contain old sales turns that distract the model
    const userMessage = capturedBody.messages.find((m: any) => m.role === "user");
    expect(userMessage.content).toContain("VĂN BẢN TRÍCH TỪ ẢNH NGƯỜI DÙNG GỬI [IMG1]:");
    expect(userMessage.content).toContain("Hãy tóm tắt và giải thích nội dung chính");
    expect(userMessage.content).not.toContain("Doanh thu 7 ngày qua");
  });
});


