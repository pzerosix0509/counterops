import { describe, expect, it } from "vitest";
import { buildAiPlan } from "@/lib/ai/semantic-layer";
import type { AiMemoryState } from "@/types/ai";

describe("structured memory state", () => {
  it("inherits lastRange from state when follow-up has no time context", () => {
    const state: AiMemoryState = {
      lastRange: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-07T23:59:59.999Z", label: "7 ngày qua" },
      lastMetric: { key: "net_revenue", version: "1.0.0" },
      updatedAt: "2026-07-08T00:00:00.000Z",
    };
    const plan = buildAiPlan(
      "còn kênh Grab thì sao?",
      "chat",
      new Date("2026-07-08T12:00:00+07:00"),
      [],
      "Asia/Ho_Chi_Minh",
      state,
    );
    expect(plan.range.label).toBe("7 ngày qua");
    expect(plan.range.from).toBe("2026-07-01T00:00:00.000Z");
  });

  it("does not inherit state range when the question has its own time context", () => {
    const state: AiMemoryState = {
      lastRange: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-07T23:59:59.999Z", label: "7 ngày qua" },
      updatedAt: "2026-07-08T00:00:00.000Z",
    };
    const plan = buildAiPlan(
      "Doanh thu hôm nay là bao nhiêu?",
      "chat",
      new Date("2026-07-08T12:00:00+07:00"),
      [],
      "Asia/Ho_Chi_Minh",
      state,
    );
    expect(plan.range.label).toBe("Hôm nay");
  });

  it("falls back to previousUserQuestions when no state", () => {
    const plan = buildAiPlan(
      "còn món nào lãi thấp?",
      "chat",
      new Date("2026-07-08T12:00:00+07:00"),
      ["Phân tích doanh thu tháng trước"],
      "Asia/Ho_Chi_Minh",
      null,
    );
    expect(plan.range.label).toBe("Tháng trước");
  });

  it("works without state at all (backward compatible)", () => {
    const plan = buildAiPlan("Doanh thu hôm nay là bao nhiêu?", "chat", new Date("2026-07-08T12:00:00+07:00"));
    expect(plan.range.label).toBe("Hôm nay");
  });
});
