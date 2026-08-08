export interface AiImageInput {
  data: string; // base64
  mime: string;
}

const IMAGE_TIMEOUT_MS = 12_000;
const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_DEFAULT_MODEL = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";

export async function imageToText(image: AiImageInput, question: string): Promise<string> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return "";
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
        temperature: 0.6,
        top_p: 0.95,
      }),
      signal: controller.signal,
    });
    if (!response.ok) return "";
    const payload = await response.json();
    const text = payload?.choices?.[0]?.message?.content;
    return typeof text === "string" ? text.trim() : "";
  } catch {
    return "";
  } finally {
    clearTimeout(timeout);
  }
}
