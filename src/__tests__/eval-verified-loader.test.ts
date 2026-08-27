import { describe, expect, it } from "vitest";
import { getEvalQueries, getGuidanceQueries, getVerifiedRepository } from "@/lib/ai/eval/load-verified";

describe("verified query repository", () => {
  it("loads and validates the repository", () => {
    const repo = getVerifiedRepository();
    expect(repo.catalogVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(repo.queries.length).toBeGreaterThan(10);
  });

  it("separates eval from guidance queries (no memorization)", () => {
    const repo = getVerifiedRepository();
    const evalIds = new Set(repo.evalQueries.map((q) => q.id));
    const guidanceIds = new Set(repo.guidanceQueries.map((q) => q.id));
    for (const id of Array.from(evalIds)) {
      expect(guidanceIds.has(id)).toBe(false);
    }
  });

  it("has at least one numbers-layer case with expectedValue", () => {
    const numbers = getEvalQueries().filter((q) => q.layer === "numbers" && q.expectedValue);
    expect(numbers.length).toBeGreaterThan(0);
  });

  it("has ambiguity cases requiring clarification", () => {
    const ambiguous = getEvalQueries().filter((q) => q.expectedClarification === true);
    expect(ambiguous.length).toBeGreaterThan(0);
  });

  it("guidance queries never carry eval-only assertions like expectedValue", () => {
    for (const q of getGuidanceQueries()) {
      expect(q.expectedValue).toBeUndefined();
    }
  });
});
