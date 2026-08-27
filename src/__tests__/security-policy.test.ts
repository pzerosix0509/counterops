import { describe, expect, it } from "vitest";
import { redactPii, redactText } from "@/lib/ai/redact";
import { filterViolatingTools, validateToolPlan } from "@/lib/ai/policy";
import type { AiToolCall } from "@/types/ai";

describe("PII redaction", () => {
  it("redacts emails, phone numbers and IDs in text", () => {
    const text = "Liên hệ nguoi@example.com hoặc 0901234567, CMND 123456789012";
    const redacted = redactText(text);
    expect(redacted).not.toContain("nguoi@example.com");
    expect(redacted).not.toContain("0901234567");
    expect(redacted).not.toContain("123456789012");
    expect(redacted).toContain("[email]");
    expect(redacted).toContain("[phone]");
    expect(redacted).toContain("[id]");
  });

  it("redacts recursively in objects (tool arguments)", () => {
    const args = { query: "SĐT 0987654321 của khách abc@xyz.com", limit: 5 };
    const redacted = redactPii(args);
    expect(redacted.query).not.toContain("0987654321");
    expect(redacted.query).not.toContain("abc@xyz.com");
    expect(redacted.limit).toBe(5);
  });

  it("leaves non-PII text unchanged", () => {
    expect(redactText("Doanh thu tháng này bao nhiêu?")).toBe("Doanh thu tháng này bao nhiêu?");
  });
});

describe("policy validator", () => {
  const plan = {
    intent: "web_search" as const,
    tools: [
      { id: "1", name: "search_web", arguments: { query: "a", limit: 5 } },
      { id: "2", name: "search_web", arguments: { query: "b", limit: 5 } },
    ] as AiToolCall[],
  };

  it("blocks multiple web searches in chat mode", () => {
    const violations = validateToolPlan(plan, { role: "owner", isDashboardMode: false });
    expect(violations.some((v) => v.tool === "search_web")).toBe(true);
  });

  it("allows multiple web searches in dashboard mode", () => {
    expect(validateToolPlan(plan, { role: "owner", isDashboardMode: true })).toEqual([]);
  });

  it("blocks tools above the role's permission", () => {
    const inventoryPlan = {
      intent: "inventory_risk" as const,
      tools: [{ id: "1", name: "inventory_risk", arguments: { status: "attention" } }] as AiToolCall[],
    };
    const violations = validateToolPlan(inventoryPlan, { role: "cashier", isDashboardMode: false });
    expect(violations.some((v) => v.tool === "inventory_risk")).toBe(true);
  });

  it("rejects unknown tools", () => {
    const badPlan = {
      intent: "metric_lookup" as const,
      tools: [{ id: "1", name: "drop_table", arguments: {} }] as unknown as AiToolCall[],
    };
    expect(validateToolPlan(badPlan, { role: "owner", isDashboardMode: false }).length).toBeGreaterThan(0);
  });

  it("filters violating tools out of the plan", () => {
    const violations = validateToolPlan(plan, { role: "owner", isDashboardMode: false });
    const filtered = filterViolatingTools(plan.tools, violations);
    expect(filtered.length).toBeLessThan(plan.tools.length);
  });
});
