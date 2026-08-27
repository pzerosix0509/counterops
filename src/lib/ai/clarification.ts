/**
 * Phát hiện câu hỏi mơ hồ cần làm rõ — KHÔNG đoán.
 *
 * - Intent ambiguity: top-2 intent có điểm gần nhau (gap < GAP_THRESHOLD)
 *   và intent đứng đầu chưa đủ tự tin (< CONFIDENCE_THRESHOLD) → hỏi lại.
 * - Entity ambiguity: một tên xuất hiện cả trong kênh bán lẫn món
 *   (vd "Grab", "Cà phê sữa") → hỏi "ý bạn là kênh hay món?".
 */

export interface IntentCandidate {
  intent: string;
  confidence: number;
}

export interface ClarificationRequest {
  question: string;
  options: string[];
  reason: "intent" | "entity";
}

const GAP_THRESHOLD = 0.15;
const CONFIDENCE_THRESHOLD = 0.8;

/** Top-k intent từ scores. Cần tối thiểu 2 ứng viên khác intent. */
export function detectIntentAmbiguity(candidates: IntentCandidate[]): ClarificationRequest | null {
  if (candidates.length < 2) return null;
  const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
  const [top, second] = sorted;
  if (!top || !second) return null;
  const gap = top.confidence - second.confidence;
  if (gap < GAP_THRESHOLD && top.confidence < CONFIDENCE_THRESHOLD) {
    return {
      question: "Mình chưa chắc bạn đang hỏi về điều gì — bạn có thể chọn giúp mình không?",
      options: [top.intent, second.intent],
      reason: "intent",
    };
  }
  return null;
}

export interface EntityNameSet {
  channels: string[];
  products: string[];
}

/** Chuẩn hóa tên để so khớp (bỏ dấu, lowercase) */
export function normalizeEntityName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .replace(/đ/g, "d")
    .trim();
}

/**
 * Kiểm tra một tên có phải vừa là kênh vừa là món không.
 * Trả về clarification nếu câu hỏi nhắc tới một thực thể mơ hồ.
 */
export function detectEntityAmbiguity(
  question: string,
  entities: EntityNameSet,
): ClarificationRequest | null {
  const q = normalizeEntityName(question);
  const channels = entities.channels.map(normalizeEntityName);
  const products = entities.products.map(normalizeEntityName);

  const mentionedChannels = channels.filter((channel) => q.includes(channel) && channel.length >= 3);

  // Một tên mơ hồ nếu: cùng một token được nhắc tới và nó là kênh, đồng thời
  // tồn tại món có tên chứa (hoặc bị chứa trong) tên kênh — vd "Grab" vs "Grab Food".
  for (const channel of mentionedChannels) {
    const productHit = products.find(
      (product) => product === channel || product.includes(channel) || channel.includes(product),
    );
    if (productHit) {
      return {
        question: `"${channel}" có thể là kênh bán hoặc tên món — bạn muốn xem theo hướng nào?`,
        options: ["Kênh bán", "Tên món"],
        reason: "entity",
      };
    }
  }
  return null;
}
