import { describe, expect, it } from "vitest";
import { parseSentimentLlmJson, ratingIsNotSentiment } from "@/lib/analytics/sentiment";

describe("parseSentimentLlmJson", () => {
  it("accepts strict JSON from the LLM", () => {
    expect(parseSentimentLlmJson({
      label: "negative",
      score: 0.86,
    })).toEqual({ label: "negative", score: 0.86 });
  });

  it("rejects unknown labels", () => {
    expect(() => parseSentimentLlmJson({ label: "POS", score: 0.9 })).toThrow();
  });
});

describe("rating vs text", () => {
  it("does not treat rating 5 as positive label", () => {
    expect(ratingIsNotSentiment(5, "negative")).toBe(true);
  });
});
