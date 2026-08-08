import { afterEach, describe, expect, it, vi } from "vitest";
import { McpClient } from "@/lib/ai/mcp-client";

function jsonRpcResponse(id: number, result: unknown) {
  return { jsonrpc: "2.0", id, result };
}

const originalEnabled = process.env.AI_MCP_ENABLED;
const originalUrl = process.env.AI_MCP_SERVER_URL;

afterEach(() => {
  vi.restoreAllMocks();
  if (originalEnabled === undefined) delete process.env.AI_MCP_ENABLED;
  else process.env.AI_MCP_ENABLED = originalEnabled;
  if (originalUrl === undefined) delete process.env.AI_MCP_SERVER_URL;
  else process.env.AI_MCP_SERVER_URL = originalUrl;
});

describe("McpClient", () => {
  it("initializes, lists and calls tools via JSON-RPC", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(jsonRpcResponse(1, { protocolVersion: "2024-11-05" })) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(jsonRpcResponse(2, { tools: [{ name: "forecast" }] })) })
      .mockResolvedValueOnce({ ok: true, text: async () => JSON.stringify(jsonRpcResponse(3, { content: [{ type: "text", text: "kết quả" }] })) });
    vi.stubGlobal("fetch", fetchMock);

    const client = new McpClient({ serverUrl: "https://mcp.example.com/mcp" });
    const guard = await client.withBreaker(async () => {
      const tools = await client.listTools();
      const result = await client.callTool("forecast", { horizon_days: 30 });
      return { tools, result };
    });

    expect(guard.ok).toBe(true);
    if (guard.ok) {
      expect(guard.value.tools.map((tool) => tool.name)).toEqual(["forecast"]);
      expect(guard.value.result.result).toBe("kết quả");
    }
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns circuit open after repeated failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500 }));
    const client = new McpClient({ serverUrl: "https://mcp.example.com/mcp" });
    await client.withBreaker(async () => []);
    await client.withBreaker(async () => []);
    const third = await client.withBreaker(async () => []);
    expect(third.ok).toBe(false);
    if (!third.ok) expect(third.error).toContain("circuit");
  });
});
