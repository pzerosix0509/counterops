import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAiPlan } from "@/lib/ai/semantic-layer";
import { executeMcpPlan } from "@/server/ai/mcp-plan";

const originalEnabled = process.env.AI_MCP_ENABLED;
const originalUrl = process.env.AI_MCP_SERVER_URL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalEnabled === undefined) delete process.env.AI_MCP_ENABLED;
  else process.env.AI_MCP_ENABLED = originalEnabled;
  if (originalUrl === undefined) delete process.env.AI_MCP_SERVER_URL;
  else process.env.AI_MCP_SERVER_URL = originalUrl;
});

function jsonRpcResponse(id: number, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

describe("executeMcpPlan", () => {
  it("does not execute when MCP is disabled", async () => {
    delete process.env.AI_MCP_ENABLED;
    delete process.env.AI_MCP_SERVER_URL;
    const plan = buildAiPlan("Dự báo doanh thu tháng tới", "chat", new Date("2026-07-01T12:00:00+07:00"));
    const result = await executeMcpPlan(plan);
    expect(result.executed).toBe(false);
    expect(result.toolCalls).toEqual([]);
  });

  it("calls matching MCP tools when enabled", async () => {
    process.env.AI_MCP_ENABLED = "true";
    process.env.AI_MCP_SERVER_URL = "https://mcp.example.com/mcp";
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(jsonRpcResponse(1, { protocolVersion: "2024-11-05" })) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(jsonRpcResponse(2, { tools: [{ name: "forecast" }, { name: "other" }] })) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(jsonRpcResponse(3, { content: [{ type: "text", text: "doanh thu 100" }] })) }));
    const plan = buildAiPlan("Dự báo doanh thu tháng tới", "chat", new Date("2026-07-01T12:00:00+07:00"));
    const result = await executeMcpPlan(plan);
    expect(result.executed).toBe(true);
    expect(result.toolCalls.map((call) => call.name)).toEqual(["forecast"]);
    expect(result.toolCalls[0].result).toBe("doanh thu 100");
  });

  it("skips when no matching tool exists", async () => {
    process.env.AI_MCP_ENABLED = "true";
    process.env.AI_MCP_SERVER_URL = "https://mcp.example.com/mcp";
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(jsonRpcResponse(1, { protocolVersion: "2024-11-05" })) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(jsonRpcResponse(2, { tools: [{ name: "unrelated" }] })) }));
    const plan = buildAiPlan("Dự báo doanh thu tháng tới", "chat", new Date("2026-07-01T12:00:00+07:00"));
    const result = await executeMcpPlan(plan);
    expect(result.executed).toBe(false);
    expect(result.toolCalls).toEqual([]);
  });
});
