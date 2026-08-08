import "server-only";
import { McpClient } from "@/lib/ai/mcp-client";
import type { AiIntent, AiPlan } from "@/types/ai";

export interface AiMcpToolCall {
  name: string;
  arguments: Record<string, unknown>;
  result: unknown;
}

export interface AiMcpPlanResult {
  executed: boolean;
  toolCalls: AiMcpToolCall[];
  error?: string;
}

// Map intent → preferred MCP tool name. Falls back to the intent itself.
const INTENT_TOOL_SUGGESTIONS: Record<AiIntent, string[]> = {
  greeting: [],
  metric_lookup: ["metrics", "metric_lookup", "analyze"],
  trend: ["trend", "timeseries"],
  comparison: ["compare", "comparison"],
  product_ranking: ["ranking", "top_products"],
  category_analysis: ["category", "category_analysis"],
  channel_analysis: ["channel", "channel_analysis"],
  inventory_risk: ["inventory", "inventory_risk"],
  document_search: ["search_documents", "search"],
  dashboard: ["dashboard"],
  diagnosis: ["diagnosis", "analyze"],
  forecast: ["forecast", "predict"],
  conversation_summary: ["summarize", "conversation_summary"],
  out_of_scope: [],
};

export async function executeMcpPlan(plan: AiPlan): Promise<AiMcpPlanResult> {
  const enabled = process.env.AI_MCP_ENABLED?.toLowerCase() === "true";
  const serverUrl = process.env.AI_MCP_SERVER_URL;
  if (!enabled || !serverUrl) return { executed: false, toolCalls: [] };

  const suggestions = INTENT_TOOL_SUGGESTIONS[plan.intent];
  if (suggestions.length === 0) return { executed: false, toolCalls: [] };

  const client = new McpClient({
    serverUrl,
    headers: process.env.AI_MCP_HEADERS ? JSON.parse(process.env.AI_MCP_HEADERS) as Record<string, string> : undefined,
  });
  const guard = await client.withBreaker(async () => {
    const tools = await client.listTools();
    const available = new Set(tools.map((tool) => tool.name));
    const matched = suggestions.filter((name) => available.has(name));
    if (matched.length === 0) return [];

    const calls: AiMcpToolCall[] = [];
    for (const name of matched) {
      const result = await client.callTool(name, {
        intent: plan.intent,
        question: plan.tools[0]?.arguments.query ?? undefined,
        range: plan.range,
      });
      calls.push({ name, arguments: { intent: plan.intent }, result: result.result });
    }
    return calls;
  });

  if (!guard.ok) return { executed: true, toolCalls: [], error: guard.error };
  return { executed: guard.value.length > 0, toolCalls: guard.value };
}
