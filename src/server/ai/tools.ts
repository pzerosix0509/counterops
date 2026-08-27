import "server-only";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { aggregateToDailyPoints, backtestForecast, computeForecast } from "@/lib/ai/forecast";
import { searchWeb } from "@/lib/ai/web-search";
import { searchAiDocumentChunks } from "@/server/queries/ai";
import { aiToolCacheKey, withAiToolCache } from "@/server/ai/cache";
import { getCustomerClusters, getDemandForecasts, computeAndPersistDemandForecasts, getRfmSummary } from "@/server/queries/analytics";
import { canRefreshAnalytics, getActiveMembership } from "@/lib/auth/permissions";
import { DEMAND_STALE_MS } from "@/lib/analytics/demand";
import type { AiSource, AiToolCall, AiToolExecution, AiToolName } from "@/types/ai";

const isoDateTime = z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
  message: "phải là ISO datetime hợp lệ",
});

const rangeArgumentsSchema = z.object({
  from: isoDateTime,
  to: isoDateTime,
  rangeLabel: z.string().min(1).max(80),
  timezone: z.string().min(1).max(80),
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
  forecast_demand: rangeArgumentsSchema.extend({
    horizon_days: z.number().int().min(7).max(30).optional(),
  }).strict(),
  rfm_summary: z.object({}).strict(),
  sentiment_summary: rangeArgumentsSchema,
  customer_segments: z.object({}).strict(),
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
  forecast_demand: "Dự báo nhu cầu món và nguyên liệu",
  rfm_summary: "Phân khúc giá trị RFM",
  sentiment_summary: "Tổng hợp cảm xúc phản hồi",
  customer_segments: "Nhóm hành vi khách (KMeans)",
};

const rpcNames: Partial<Record<AiToolName, string>> = {
  sales_summary: "ai_sales_summary",
  sales_timeseries: "ai_sales_timeseries",
  top_products: "ai_top_products",
  category_summary: "ai_category_summary",
  channel_summary: "ai_channel_summary",
  period_comparison: "ai_period_comparison",
  sentiment_summary: "ai_sentiment_summary",
};

export interface AiToolContext {
  organizationId: string;
  branchId: string;
  timezone: string;
  /** Thời điểm dữ liệu được chụp — chung cho cả phiên chạy tool */
  dataAsOf: string;
  /** Id snapshot cho cả phiên — mọi tool cùng một snapshot */
  snapshotId: string;
  /** Catalog version — đi vào cache key để đổi catalog tự invalidate */
  catalogVersion: string;
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
      p_timezone: args.timezone,
    },
    top_products: { ...common, p_limit: args.limit },
    category_summary: { ...common, p_limit: args.limit },
    channel_summary: common,
    period_comparison: common,
    sentiment_summary: common,
  };
  const rpc = rpcNames[call.name];
  if (!rpc) throw new Error(`Tool ${call.name} không có RPC.`);

  const cacheKey = aiToolCacheKey({
    organizationId: context.organizationId,
    branchId: context.branchId,
    tool: call.name,
    arguments: rpcArguments[call.name] ?? {},
    catalogVersion: context.catalogVersion,
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
    catalogVersion: context.catalogVersion,
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
      p_timezone: args.timezone,
    });
    if (error) throw new Error(error.message);
    const daily = aggregateToDailyPoints(
      (data ?? []) as Array<{ period_start: string; net_revenue: number; total_orders: number }>,
    );
    const forecast = computeForecast(daily, horizonDays);
    // Backtest WMAPE/MASE trên dữ liệu lịch sử (rẻ, chạy ngay) — trả thành thật về độ tin cậy
    const backtest = backtestForecast(daily);
    return [{ ...forecast, backtest } as unknown as Record<string, unknown>];
  });
  return { rows: cached.value, cacheHit: cached.hit };
}

async function executeForecastDemand(
  call: AiToolCall,
  context: AiToolContext,
): Promise<{ rows: Array<Record<string, unknown>>; cacheHit: boolean }> {
  const args = call.arguments as Record<string, any>;
  const horizonDays = Number(args.horizon_days ?? 14);
  const membership = await getActiveMembership();
  const canRefresh = membership ? canRefreshAnalytics.includes(membership.role) : false;
  let view = await getDemandForecasts(context.organizationId, context.branchId, horizonDays);
  const computedAtMs = view.computedAt ? new Date(view.computedAt).getTime() : 0;
  const stale = !view.computedAt || Date.now() - computedAtMs > DEMAND_STALE_MS;
  let warning: string | null = null;

  if (stale && canRefresh) {
    await computeAndPersistDemandForecasts(context.organizationId, context.branchId, horizonDays);
    view = await getDemandForecasts(context.organizationId, context.branchId, horizonDays);
  } else if (stale) {
    warning = "Dữ liệu dự báo cũ hơn 24 giờ.";
    return {
      rows: [{
        warning,
        stale: true,
        computed_at: view.computedAt,
        method: view.method,
        horizon_days: horizonDays,
        insufficient_data: view.insufficientData,
        dishes: view.dishes,
        ingredients: view.ingredients,
      } as Record<string, unknown>],
      cacheHit: false,
    };
  }

  const snapshotKey = aiToolCacheKey({
    organizationId: context.organizationId,
    branchId: context.branchId,
    tool: "forecast_demand",
    arguments: { horizon_days: horizonDays, computed_at: view.computedAt },
  });
  const cached = await withAiToolCache(snapshotKey, async () => [{
    warning,
    stale: false,
    computed_at: view.computedAt,
    method: view.method,
    horizon_days: horizonDays,
    insufficient_data: view.insufficientData,
    dishes: view.dishes,
    ingredients: view.ingredients,
  } as Record<string, unknown>]);
  return { rows: cached.value, cacheHit: cached.hit };
}

async function executeRfmSummary(context: AiToolContext) {
  const cacheKey = aiToolCacheKey({
    organizationId: context.organizationId,
    branchId: context.branchId,
    tool: "rfm_summary",
    arguments: {},
  });
  return withAiToolCache(cacheKey, async () => {
    const rows = await getRfmSummary(context.organizationId, context.branchId);
    return rows.map((row) => ({
      rfm_segment: row.segment,
      customer_count: row.customerCount,
      avg_monetary: row.avgMonetary,
    }));
  });
}

async function executeCustomerSegments(context: AiToolContext) {
  const cacheKey = aiToolCacheKey({
    organizationId: context.organizationId,
    branchId: context.branchId,
    tool: "customer_segments",
    arguments: {},
  });
  return withAiToolCache(cacheKey, async () => {
    const view = await getCustomerClusters(context.organizationId, context.branchId);
    return [
      {
        reminder: view.reminder,
        k: view.k,
        silhouette: view.silhouette,
        fitted_at: view.fittedAt,
        profiles: view.profiles,
      } as Record<string, unknown>,
    ];
  });
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
    if (call.name === "forecast_demand") {
      const result = await executeForecastDemand(call, context);
      return { call, rows: result.rows, cacheHit: result.cacheHit, durationMs: Date.now() - startedAt };
    }
    if (call.name === "rfm_summary") {
      const cached = await executeRfmSummary(context);
      return { call, rows: cached.value, cacheHit: cached.hit, durationMs: Date.now() - startedAt };
    }
    if (call.name === "customer_segments") {
      const cached = await executeCustomerSegments(context);
      return { call, rows: cached.value, cacheHit: cached.hit, durationMs: Date.now() - startedAt };
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

export function buildSourcesFromToolExecutions(
  executions: AiToolExecution[],
  provenance: {
    asOf: string;
    snapshotId: string;
    catalogVersion: string;
    metricKey?: string;
    metricVersion?: string;
  },
): AiSource[] {
  const pending: Omit<AiSource, "id">[] = [];

  for (const execution of executions) {
    if (execution.call.name === "search_documents" || execution.call.name === "search_web") {
      for (const source of execution.sources ?? []) {
        const { id: _id, ...withoutId } = source;
        pending.push({
          ...withoutId,
          meta: {
            ...(withoutId.meta ?? {}),
            ...provenance,
            cacheHit: execution.cacheHit ?? false,
            sourceAsOf: provenance.asOf,
          },
        });
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
        queryHash: stableQueryHash(execution.call),
        ...provenance,
      },
    });
  }

  return pending.map((source, index) => ({ ...source, id: `S${index + 1}` }));
}

/** Hash ổn định của {tool, arguments} — dùng để đối chiếu query khi eval */
function stableQueryHash(call: AiToolCall): string {
  const sorted = JSON.stringify(
    Object.fromEntries(
      Object.entries(call.arguments).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
  let hash = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    hash = ((hash << 5) - hash + sorted.charCodeAt(i)) | 0;
  }
  return `q${Math.abs(hash).toString(36)}`;
}
