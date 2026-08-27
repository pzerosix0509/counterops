import { describe, expect, it } from "vitest";
import { runEvalSuite } from "@/lib/ai/eval/runner";

const EVAL_NOW = new Date("2026-08-04T12:00:00+07:00");

describe("eval suite — planning layer", () => {
  it("routes verified eval questions to expected intent/tools/range", async () => {
    const result = await runEvalSuite({ layer: "planning", now: EVAL_NOW });
    expect(result.total).toBeGreaterThan(0);
    // Planning deterministic → kỳ vọng rất cao (≥ 0.95)
    expect(result.accuracy).toBeGreaterThanOrEqual(0.95);
    const failed = result.cases.filter((c) => !c.passed);
    if (failed.length > 0) {
      // eslint-disable-next-line no-console
      console.log("Planning failures:", failed.map((f) => ({ id: f.caseId, checks: f.checks })));
    }
  });

  it("marks ambiguous questions as requiring clarification", async () => {
    const result = await runEvalSuite({ layer: "quality", now: EVAL_NOW });
    const ambiguous = result.cases.filter((c) => c.caseId === "VQ-008" || c.caseId === "VQ-009");
    for (const item of ambiguous) {
      expect(item.passed).toBe(true);
    }
  });
});

describe("eval suite — numbers layer", () => {
  it("matches ground-truth values from synthetic dataset", async () => {
    const result = await runEvalSuite({ layer: "numbers", now: EVAL_NOW });
    expect(result.total).toBeGreaterThan(0);
    const failed = result.cases.filter((c) => !c.passed);
    if (failed.length > 0) {
      // eslint-disable-next-line no-console
      console.log("Numbers failures:", failed.map((f) => ({ id: f.caseId, checks: f.checks })));
    }
    expect(failed).toEqual([]);
  });
});

describe("eval suite — quality layer", () => {
  it("detects data-quality issues and anomalies per scenario", async () => {
    const result = await runEvalSuite({ layer: "quality", now: EVAL_NOW });
    expect(result.total).toBeGreaterThan(0);
    const failed = result.cases.filter((c) => !c.passed);
    if (failed.length > 0) {
      // eslint-disable-next-line no-console
      console.log("Quality failures:", failed.map((f) => ({ id: f.caseId, checks: f.checks, steps: f.steps })));
    }
    expect(failed).toEqual([]);
  });
});
