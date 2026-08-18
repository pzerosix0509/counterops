import { sentimentLlmSchema, type SentimentLlmPayload } from "@/lib/ai/schemas";

export type SentimentScore = SentimentLlmPayload;

export function parseSentimentLlmJson(raw: unknown): SentimentScore {
  return sentimentLlmSchema.parse(raw);
}

export function ratingIsNotSentiment(
  rating: number,
  label: SentimentScore["label"],
): boolean {
  return (rating >= 4 && label === "negative") || (rating <= 2 && label === "positive");
}
