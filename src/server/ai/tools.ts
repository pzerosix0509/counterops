import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { aggregateToDailyPoints, computeForecast } from "@/lib/ai/forecast";
import { searchWeb } from "@/lib/ai/web-search";
import { searchAiDocumentChunks } from "@/server/queries/ai";
import { aiToolCacheKey, withAiToolCache } from "@/server/ai/cache";
import type { AiSource, AiToolCall, AiToolExecution, AiToolName } from "@/types/ai";

const rangeArgumentsSchema = z.object({
  from: z.string().datetime(),
  to: z.string().datetime(),
  rangeLabel: z.string().min(1).max(80),
}).strict();

const toolArgumentSchemas = {
  sales_summary: rangeArgumentsSchema,
  sales_timeseries: rangeArgumentsSchema.extend({
    granularity: z.enum(["hour", "day", "week", "month"]),
  }).strict(),
  top_products: rangeArgumentsSchema.extend({
    limit: z.number().int().min(1).max(50),
  }).strict(),
  category_summary: rangeArgumentsSchema.extend({
    limit: z.number().int().min(1).max(50),
  }).strict(),
  channel_summary: rangeArgumentsSchema,
  period_comparison: rangeArgumentsSchema,
  inventory_risk: z.object({
    status: z.literal("attention"),
  }).strict(),
  search_documents: z.object({
    query: z.string().trim().min(2).max(1000),
    limit: z.number().int().min(1).max(12),
  }).strict(),
  search_web: z.object({
    query: z.string().trim().min(2).max(500),
    limit: z.number().int().min(1).max(10).optional(),
  }).strict(),
  forecast_revenue: rangeArgumentsSchema.extend({
    horizon_days: z.number().int().min(7).max(90).optional(),
  }).strict(),
} satisfies Record<AiToolName, z.ZodType>;

const sourceLabels: Record<Exclude<AiToolName, "search_documents" | "search_web">, string> = {
  sales_summary: "Tổng hợp bán hàng",
  sales_timeseries: "Doanh thu theo thời gian",
  top_products: "Hiệu quả theo món",
  category_summary: "Hiệu quả theo nhóm món",
  channel_summary: "Doanh thu theo kênh bán",
  period_comparison: "So sánh với kỳ trước",
  inventory_risk: "Cảnh báo tồn kho",
  forecast_revenue: "Dự báo doanh thu",
};

const rpcNames: Partial<Record<AiToolName, string>> = {
  sales_summary: "ai_sales_summary",
  sales_timeseries: "ai_sales_timeseries",
  top_products: "ai_top_products",
  category_summary: "ai_category_summary",
  channel_summary: "ai_channel_summary",
  period_comparison: "ai_period_comparison",
};

export interface AiToolContext {
  organizationId: string;
  branchId: string;
  timezone: string;
}

async function executeRpcTool(
  call: AiToolCall,
  context: AiToolContext,
): Promise<{ rows: Array<Record<string, unknown>>; cacheHit: boolean }> {
  const supabase = createSupabaseServerClient();
  const args = call.arguments as Record<string, any>;
  const common = {
    p_org_id: context.organizationId,
    p_branch_id: context.branchId,
    p_from: args.from,
    p_to: args.to,
  };

  const rpcArguments: Partial<Record<AiToolName, Record<string, unknown>>> = {
    sales_summary: common,
    sales_timeseries: {
      ...common,
      p_granularity: args.granularity,
      p_timezone: context.timezone,
    },
    top_products: { ...common, p_limit: args.limit },
    category_summary: { ...common, p_limit: args.limit },
    channel_summary: common,
    period_comparison: common,
  };
  const rpc = rpcNames[call.name];
  if (!rpc) throw new Error(`Tool ${call.name} không có RPC.`);

  const cacheKey = aiToolCacheKey({
    organizationId: context.organizationId,
    branchId: context.branchId,
    tool: call.name,
    arguments: rpcArguments[call.name] ?? {},
  });
  const cached = await withAiToolCache(cacheKey, async () => {
    const { data, error } = await supabase.rpc(rpc as any, rpcArguments[call.name] as any);
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<Record<string, unknown>>;
  });
  return { rows: cached.value, cacheHit: cached.hit };
}

async function executeInventoryRisk(context: AiToolContext) {
  const cacheKey = aiToolCacheKey({
    organizationId: context.organizationId,
    branchId: context.branchId,
    tool: "inventory_risk",
    arguments: { status: "attention" },
  });
  return withAiToolCache(cacheKey, async () => {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
      .from("inventory_balances")
      .select("inventory_item_id, quantity_on_hand, low_stock_threshold, inventory_items!inner(name, code, unit)")
      .eq("organization_id", context.organizationId)
      .eq("branch_id", context.branchId)
      .order("quantity_on_hand", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);

    return (data ?? [])
      .map((row: any) => {
        const quantity = Number(row.quantity_on_hand);
        const threshold = Number(row.low_stock_threshold);
        const status = quantity < 0 ? "Âm kho" : quantity === 0 ? "Hết hàng" : quantity <= threshold ? "Sắp hết" : "Ổn";
        return {
          inventory_item_id: row.inventory_item_id,
          item_name: row.inventory_items?.name ?? "Không rõ",
          item_code: row.inventory_items?.code ?? "",
          unit: row.inventory_items?.unit ?? "",
          quantity_on_hand: quantity,
          low_stock_threshold: threshold,
          status,
        };
      })
      .filter((row) => row.status !== "Ổn")
      .slice(0, 50);
  });
}

async function executeForecast(
  call: AiToolCall,
  context: AiToolContext,
): Promise<{ rows: Array<Record<string, unknown>>; cacheHit: boolean }> {
  const args = call.arguments as Record<string, any>;
  const horizonDays = Number(args.horizon_days ?? 30);
  const cacheKey = aiToolCacheKey({
    organizationId: context.organizationId,
    branchId: context.branchId,
    tool: "forecast_revenue",
    arguments: { from: args.from, to: args.to, horizon_days: horizonDays },
  });
  const cached = await withAiToolCache(cacheKey, async () => {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.rpc("ai_sales_timeseries" as any, {
      p_org_id: context.organizationId,
      p_branch_id: context.branchId,
      p_from: args.from,
      p_to: args.to,
      p_granularity: "day",
      p_timezone: context.timezone,
    });
    if (error) throw new Error(error.message);
    const daily = aggregateToDailyPoints(
      (data ?? []) as Array<{ period_start: string; net_revenue: number; total_orders: number }>,
    );
    const forecast = computeForecast(daily, horizonDays);
    return [forecast as unknown as Record<string, unknown>];
  });
  return { rows: cached.value, cacheHit: cached.hit };
}

export async function executeAiTool(
  call: AiToolCall,
  context: AiToolContext,
): Promise<AiToolExecution> {
  const startedAt = Date.now();
  const parsed = toolArgumentSchemas[call.name].safeParse(call.arguments);
  if (!parsed.success) {
    return {
      call,
      rows: [],
      durationMs: Date.now() - startedAt,
      error: `Tham số tool không hợp lệ: ${parsed.error.issues[0]?.message ?? "unknown"}`,
    };
  }

  try {
    if (call.name === "search_documents") {
      const sources = await searchAiDocumentChunks(
        context.organizationId,
        context.branchId,
        String(call.arguments.query),
        Number(call.arguments.limit),
      );
      return {
        call,
        rows: sources.map((source) => ({
          label: source.label,
          detail: source.detail ?? "",
          excerpt: source.excerpt ?? "",
        })),
        sources,
        durationMs: Date.now() - startedAt,
      };
    }

    if (call.name === "search_web") {
      const results = await searchWeb(
        String(call.arguments.query),
        Number(call.arguments.limit ?? 5),
      );
      const sources: AiSource[] = results.map((result, index) => ({
        id: `web-${index + 1}`,
        type: "web",
        label: result.title,
        detail: result.url,
        excerpt: result.content,
        meta: { tool: "search_web", url: result.url },
      }));
      return {
        call,
        rows: results.map((result) => ({ title: result.title, url: result.url, content: result.content })),
        sources,
        durationMs: Date.now() - startedAt,
      };
    }

    if (call.name === "inventory_risk") {
      const cached = await executeInventoryRisk(context);
      return { call, rows: cached.value, cacheHit: cached.hit, durationMs: Date.now() - startedAt };
    }
    if (call.name === "forecast_revenue") {
      const result = await executeForecast(call, context);
      return { call, rows: result.rows, cacheHit: result.cacheHit, durationMs: Date.now() - startedAt };
    }
    const result = await executeRpcTool(call, context);
    return { call, rows: result.rows, cacheHit: result.cacheHit, durationMs: Date.now() - startedAt };
  } catch (error) {
    return {
      call,
      rows: [],
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Không thực thi được analytics tool.",
    };
  }
}

// Tools that must complete before dependent tools can be scheduled in wave 2.
// In practice all RPCs are independent at the DB layer, but inventory_risk and
// search_documents are I/O-heavy and benefit from being batched separately so
// a fast sales_summary result can short-circuit the agentic loop early.
const WAVE1_TOOLS = new Set<AiToolName>([
  "sales_summary",
  "top_products",
  "category_summary",
  "channel_summary",
  "inventory_risk",
]);

export async function executeAiToolPlan(calls: AiToolCall[], context: AiToolContext) {
  const wave1 = calls.filter((call) => WAVE1_TOOLS.has(call.name));
  const wave2 = calls.filter((call) => !WAVE1_TOOLS.has(call.name));

  const wave1Results = await Promise.all(wave1.map((call) => executeAiTool(call, context)));
  if (wave2.length === 0) return wave1Results;

  const wave2Results = await Promise.all(wave2.map((call) => executeAiTool(call, context)));
  return [...wave1Results, ...wave2Results];
}

export function buildSourcesFromToolExecutions(executions: AiToolExecution[]): AiSource[] {
  const pending: Omit<AiSource, "id">[] = [];

  for (const execution of executions) {
    if (execution.call.name === "search_documents" || execution.call.name === "search_web") {
      for (const source of execution.sources ?? []) {
        const { id: _id, ...withoutId } = source;
        pending.push(withoutId);
      }
      continue;
    }

    if (execution.error || execution.rows.length === 0) continue;
    const toolName = execution.call.name as Exclude<AiToolName, "search_documents" | "search_web">;
    pending.push({
      type: "analytics",
      label: sourceLabels[toolName],
      detail: String(execution.call.arguments.rangeLabel ?? "Chi nhánh hiện tại"),
      excerpt: JSON.stringify(execution.rows.length === 1 ? execution.rows[0] : execution.rows),
      meta: {
        tool: toolName,
        rpc: rpcNames[toolName] ?? null,
        arguments: execution.call.arguments,
        rows: execution.rows.length,
        durationMs: execution.durationMs,
        cacheHit: execution.cacheHit ?? false,
      },
    });
  }

  return pending.map((source, index) => ({ ...source, id: `S${index + 1}` }));
}
