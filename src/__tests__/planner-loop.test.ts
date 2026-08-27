import { describe, expect, it } from "vitest";
import { supplementalToolsFor, DEFAULT_BUDGET } from "@/lib/ai/planner-loop";
import type { AiPlan } from "@/types/ai";

function planFor(intent: AiPlan["intent"], tools: AiPlan["tools"], deterministic = false): AiPlan {
  return {
    intent,
    intentConfidence: 0.9,
    modelTier: deterministic ? "none" : "fast",
    deterministic,
    rationale: "test",
    range: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-07T23:59:59.999Z", label: "7 ngày qua" },
    tools,
  };
}

describe("planner loop supplemental tools", () => {
  it("adds missing diagnosis tools when range exists", () => {
    const plan = planFor("diagnosis", [
      { id: "1", name: "sales_summary", arguments: { from: "a", to: "b", rangeLabel: "7 ngày qua", timezone: "Asia/Ho_Chi_Minh" } },
      { id: "2", name: "sales_timeseries", arguments: { from: "a", to: "b", rangeLabel: "7 ngày qua", timezone: "Asia/Ho_Chi_Minh", granularity: "day" } },
    ]);
    const supplemental = supplementalToolsFor(plan, new Set(["sales_summary", "sales_timeseries"]), true, false);
    const names = supplemental.map((call) => call.name);
    expect(names).toContain("period_comparison");
    expect(names).toContain("top_products");
    expect(names).toContain("channel_summary");
  });

  it("does not duplicate tools already executed", () => {
    const plan = planFor("diagnosis", [
      { id: "1", name: "sales_summary", arguments: { from: "a", to: "b", rangeLabel: "x", timezone: "z" } },
      { id: "2", name: "period_comparison", arguments: { from: "a", to: "b", rangeLabel: "x", timezone: "z" } },
    ]);
    const supplemental = supplementalToolsFor(
      plan,
      new Set(["sales_summary", "period_comparison"]),
      true,
      false,
    );
    expect(supplemental.some((call) => call.name === "period_comparison")).toBe(false);
  });

  it("adds inventory_risk when anomalies exist and it is missing", () => {
    const plan = planFor("diagnosis", [
      { id: "1", name: "sales_summary", arguments: { from: "a", to: "b", rangeLabel: "x", timezone: "z" } },
    ]);
    const supplemental = supplementalToolsFor(plan, new Set(["sales_summary"]), true, true);
    expect(supplemental.some((call) => call.name === "inventory_risk")).toBe(true);
  });

  it("respects maxTotalTools budget", () => {
    expect(DEFAULT_BUDGET.maxTotalTools).toBe(8);
    expect(DEFAULT_BUDGET.maxRounds).toBe(3);
    expect(DEFAULT_BUDGET.stopConfidence).toBe(0.7);
  });

  it("returns nothing when no range args available", () => {
    const plan = planFor("diagnosis", [
      { id: "1", name: "inventory_risk", arguments: { status: "attention" } },
    ]);
    expect(supplementalToolsFor(plan, new Set(["inventory_risk"]), false, false)).toEqual([]);
  });
});
