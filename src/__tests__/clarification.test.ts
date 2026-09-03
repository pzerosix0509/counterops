import { describe, expect, it } from "vitest";
import {
  detectEntityAmbiguity,
  detectIntentAmbiguity,
  normalizeEntityName,
} from "@/lib/ai/clarification";
import { buildAiPlan } from "@/lib/ai/semantic-layer";

describe("intent ambiguity detection", () => {
  it("asks for clarification when top-2 intents are close", () => {
    const clarification = detectIntentAmbiguity([
      { intent: "metric_lookup", confidence: 0.72 },
      { intent: "web_search", confidence: 0.7 },
    ]);
    expect(clarification).not.toBeNull();
    expect(clarification!.reason).toBe("intent");
    expect(clarification!.options).toContain("metric_lookup");
  });

  it("returns null when top intent is confident", () => {
    expect(detectIntentAmbiguity([
      { intent: "dashboard", confidence: 0.99 },
      { intent: "trend", confidence: 0.7 },
    ])).toBeNull();
  });

  it("returns null with a single candidate", () => {
    expect(detectIntentAmbiguity([{ intent: "greeting", confidence: 0.99 }])).toBeNull();
  });
});

describe("entity ambiguity detection", () => {
  it("detects a name that is both a channel and a product", () => {
    const clarification = detectEntityAmbiguity(
      "Doanh thu Grab tháng này bao nhiêu?",
      { channels: ["Grab"], products: ["Grab Food", "Cà phê sữa"] },
    );
    expect(clarification).not.toBeNull();
    expect(clarification!.reason).toBe("entity");
    expect(clarification!.options).toEqual(["Kênh bán", "Tên món"]);
  });

  it("returns null when the name is only a channel", () => {
    expect(detectEntityAmbiguity(
      "Doanh thu Grab tháng này bao nhiêu?",
      { channels: ["Grab"], products: ["Cà phê sữa"] },
    )).toBeNull();
  });

  it("normalizes Vietnamese diacritics before matching", () => {
    expect(normalizeEntityName("Cà phê sữa")).toBe("ca phe sua");
  });
});

describe("clarification in plan", () => {
  it("sets clarification for genuinely ambiguous questions", () => {
    const plan = buildAiPlan("Giá hôm nay thế nào?", "chat", new Date("2026-07-01T12:00:00+07:00"));
    expect(plan.clarification).toBeDefined();
    expect(plan.clarification!.reason).toBe("intent");
  });

  it("does not set clarification for clear web price questions", () => {
    const plan = buildAiPlan("Giá vàng hôm nay bao nhiêu?", "chat", new Date("2026-07-01T12:00:00+07:00"));
    expect(plan.clarification).toBeUndefined(); // web_search tự tin 0.95
  });

  it("does not set clarification for clear analytics questions", () => {
    const plan = buildAiPlan("Doanh thu hôm nay là bao nhiêu?", "chat", new Date("2026-07-01T12:00:00+07:00"));
    expect(plan.clarification).toBeUndefined();
  });
});
