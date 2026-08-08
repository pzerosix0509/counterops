export interface AiImageInput {
  data: string; // base64
  mime: string;
}

const IMAGE_TIMEOUT_MS = Number(process.env.AI_IMAGE_TIMEOUT_MS ?? 20_000);
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_DEFAULT_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";

/**
 * Extract text from an image via the NVIDIA vision model.
 * Throws on failure instead of silently returning "" so callers can surface
 * a clear error ("ảnh không đọc được") instead of pretending there is no text.
 */
export async function imageToText(image: AiImageInput, question: string): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("Thiếu NVIDIA_API_KEY để đọc ảnh.");
  const model = process.env.AI_VISION_MODEL || NVIDIA_DEFAULT_MODEL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), IMAGE_TIMEOUT_MS);
  try {
    const response = await fetch(NVIDIA_BASE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Trích xuất toàn bộ văn bản trong ảnh. Bối cảnh câu hỏi của người dùng: ${question}`,
              },
              {
                type: "image_url",
                image_url: { url: `data:${image.mime};base64,${image.data}` },
              },
            ],
          },
        ],
        max_tokens: 1_000,
        stream: false,
        temperature: 0.2,
        top_p: 0.9,
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`NVIDIA vision trả lỗi HTTP ${response.status}.`);
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    // content may be a string, or an array of parts ({type:"text",text:...})
    const text = Array.isArray(content)
      ? content.map((part) => part?.text ?? "").join(" ")
      : typeof content === "string" ? content : "";
    const trimmed = text.trim();
    if (!trimmed) throw new Error("NVIDIA vision không trích được văn bản từ ảnh.");
    return trimmed;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Đọc ảnh quá lâu (quá ${IMAGE_TIMEOUT_MS}ms).`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
