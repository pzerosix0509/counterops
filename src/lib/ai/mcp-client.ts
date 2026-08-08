import { AiCircuitBreaker, runWithTimeout } from "@/lib/ai/circuit-breaker";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpClientConfig {
  serverUrl: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

interface McpJsonRpcResponse<T> {
  jsonrpc: "2.0";
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

const MCP_TIMEOUT_MS = 8_000;
const BREAKER_KEY = Symbol.for("counterops.ai.mcp-circuit-breaker");

function mcpBreaker() {
  const globalState = globalThis as typeof globalThis & {
    [BREAKER_KEY]?: AiCircuitBreaker;
  };
  if (!globalState[BREAKER_KEY]) {
    globalState[BREAKER_KEY] = new AiCircuitBreaker({
      failureThreshold: Number(process.env.AI_MCP_CIRCUIT_FAILURE_THRESHOLD ?? 2),
      cooldownMs: Number(process.env.AI_MCP_CIRCUIT_COOLDOWN_MS ?? 60_000),
    });
  }
  return globalState[BREAKER_KEY];
}

export class McpClient {
  private readonly breaker = mcpBreaker();
  private nextId = 1;

  constructor(private readonly config: McpClientConfig) {}

  private get breakerKey() {
    return `${this.config.serverUrl}`;
  }

  private async request<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    const body = {
      jsonrpc: "2.0" as const,
      id,
      method,
      params,
    };
    const timeoutMs = this.config.timeoutMs ?? MCP_TIMEOUT_MS;
    const response = await runWithTimeout(timeoutMs, async (signal) => {
      const res = await fetch(this.config.serverUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
          ...(this.config.headers ?? {}),
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) throw new Error(`MCP server HTTP ${res.status}`);
      const text = await res.text();
      const parsed = JSON.parse(text) as McpJsonRpcResponse<T>;
      if (parsed.error) throw new Error(`MCP ${method} lỗi: ${parsed.error.message}`);
      return parsed.result as T;
    });
    return response;
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "counterops-ai", version: "1.0.0" },
    });
  }

  async listTools(): Promise<McpTool[]> {
    const result = await this.request<{ tools: McpTool[] }>("tools/list", {});
    return result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<{ result: unknown }> {
    const result = await this.request<{ content?: Array<{ type: string; text?: string }> }>("tools/call", {
      name,
      arguments: args,
    });
    if (Array.isArray(result?.content)) {
      return { result: result.content.map((item) => item.text ?? "").join("\n") };
    }
    return { result };
  }

  async withBreaker<T>(operation: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
    if (!this.breaker.canRequest(this.breakerKey)) {
      return { ok: false, error: "MCP circuit breaker đang mở." };
    }
    try {
      await this.initialize();
      const value = await operation();
      this.breaker.recordSuccess(this.breakerKey);
      return { ok: true, value };
    } catch (error) {
      this.breaker.recordFailure(this.breakerKey);
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Không gọi được MCP server.",
      };
    }
  }
}
