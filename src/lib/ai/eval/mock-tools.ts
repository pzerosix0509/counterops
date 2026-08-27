/**
 * Mock executeAiToolPlan cho eval — đọc dữ liệu từ synthetic fixture.
 * Signature giống executeAiToolPlan thật để runPlannerLoop/assessAiEvidence/
 * buildAnalyticsContext/buildDeterministicAnswer chạy y nguyên, không gọi Supabase.
 */
import { computeForecast } from "@/lib/ai/forecast";
import { EVAL_DATASET, scenarioDays, type DataQualityScenario, type EvalDay } from "@/lib/ai/eval/synthetic-data";
import type { AiToolCall, AiToolExecution } from "@/types/ai";

export interface MockToolsOptions {
  scenario?: DataQualityScenario;
  /** tool bị lỗi (timeout) — nếu đặt, execution trả error */
  failTool?: AiToolCall["name"] | null;
}

const DAYS = EVAL_DATASET.days;

/** Chuyển ISO sang ngày local theo timezone (giống DB tính theo p_timezone) */
function isoToLocalDate(iso: string, timezone: string): string {
  const date = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts;
}

function dayRange(days: EvalDay[], from: string, to: string, timezone = EVAL_DATASET.timezone): EvalDay[] {
  const fromDate = isoToLocalDate(from, timezone);
  const toDate = isoToLocalDate(to, timezone);
  return days
    .filter((day) => day.date >= fromDate && day.date <= toDate)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function sumDays(days: EvalDay[]) {
  return {
    total_orders: days.reduce((sum, d) => sum + d.orders, 0),
    net_revenue: days.reduce((sum, d) => sum + d.revenue, 0),
    cost_of_goods: days.reduce((sum, d) => sum + d.cogs, 0),
    gross_profit: days.reduce((sum, d) => sum + (d.revenue - d.cogs), 0),
    channel_fees: days.reduce((sum, d) => sum + d.fees, 0),
    net_profit: days.reduce((sum, d) => sum + (d.revenue - d.cogs - d.fees - (d.refunds ?? 0)), 0),
  };
}

function execution(
  call: AiToolCall,
  rows: Array<Record<string, unknown>>,
  failTool: AiToolCall["name"] | null | undefined,
): AiToolExecution {
  const durationMs = 5;
  if (failTool === call.name) {
    return { call, rows: [], durationMs, error: "Tool timeout: mock evaluation failure" };
  }
  return { call, rows, durationMs, cacheHit: false };
}

function previousPeriodRange(from: string, to: string): { from: string; to: string } {
  const toDate = new Date(to);
  const fromDate = new Date(from);
  const span = toDate.getTime() - fromDate.getTime();
  const prevTo = new Date(fromDate.getTime() - 1);
  const prevFrom = new Date(prevTo.getTime() - span);
  return {
    from: prevFrom.toISOString(),
    to: prevTo.toISOString(),
  };
}

export function mockExecuteToolPlan(
  calls: AiToolCall[],
  options: MockToolsOptions = {},
): AiToolExecution[] {
  const { scenario = "base", failTool } = options;
  const days = scenarioDays(scenario);

  return calls.map((call) => {
    const args = call.arguments as { from?: string; to?: string; granularity?: string; limit?: number; rangeLabel?: string; timezone?: string };
    const from = args.from ?? DAYS[0]!.date;
    const to = args.to ?? DAYS.at(-1)!.date;
    const timezone = args.timezone ?? EVAL_DATASET.timezone;
    const ranged = dayRange(days, from, to, timezone);

    switch (call.name) {
      case "sales_summary": {
        const totals = sumDays(ranged);
        return execution(call, [{ ...totals }], failTool);
      }
      case "sales_timeseries": {
        const granularity = args.granularity ?? "day";
        if (granularity === "day") {
          return execution(
            call,
            ranged.map((day) => ({ period_start: `${day.date}T00:00:00.000Z`, ...sumDays([day]) })),
            failTool,
          );
        }
        // week/month: gộp theo tuần/tháng (đơn giản hóa: gộp theo khoảng 7 ngày)
        const weekly: Array<Record<string, unknown>> = [];
        for (let i = 0; i < ranged.length; i += 7) {
          const chunk = ranged.slice(i, i + 7);
          weekly.push({
            period_start: `${chunk[0]!.date}T00:00:00.000Z`,
            ...sumDays(chunk),
          });
        }
        return execution(call, weekly, failTool);
      }
      case "top_products": {
        const productAgg: Record<string, { quantity: number; revenue: number; cogs: number }> = {};
        for (const day of ranged) {
          for (const p of day.products) {
            const agg = productAgg[p.name] ?? { quantity: 0, revenue: 0, cogs: 0 };
            agg.quantity += p.quantity;
            agg.revenue += p.revenue;
            agg.cogs += p.cogs;
            productAgg[p.name] = agg;
          }
        }
        const limit = Number(args.limit ?? 10);
        const rows = Object.entries(productAgg)
          .sort((a, b) => b[1].revenue - a[1].revenue)
          .slice(0, limit)
          .map(([name, agg]) => ({
            product_name: name,
            quantity: agg.quantity,
            revenue: agg.revenue,
            cost_of_goods: agg.cogs,
            gross_profit: agg.revenue - agg.cogs,
          }));
        return execution(call, rows, failTool);
      }
      case "channel_summary": {
        const channelAgg: Record<string, { orders: number; revenue: number }> = {};
        for (const day of ranged) {
          for (const c of day.channel) {
            const agg = channelAgg[c.name] ?? { orders: 0, revenue: 0 };
            agg.orders += c.orders;
            agg.revenue += c.revenue;
            channelAgg[c.name] = agg;
          }
        }
        const rows = Object.entries(channelAgg).map(([name, agg]) => ({
          channel_name: name,
          orders: agg.orders,
          revenue: agg.revenue,
          channel_fees: Math.round(agg.revenue * 0.05),
        }));
        return execution(call, rows, failTool);
      }
      case "category_summary": {
        const categoryAgg: Record<string, { quantity: number; revenue: number }> = {};
        for (const day of ranged) {
          for (const c of day.categories) {
            const agg = categoryAgg[c.name] ?? { quantity: 0, revenue: 0 };
            agg.quantity += c.quantity;
            agg.revenue += c.revenue;
            categoryAgg[c.name] = agg;
          }
        }
        const rows = Object.entries(categoryAgg).map(([name, agg]) => ({
          category_id: `cat-${name.toLowerCase()}`,
          category_name: name,
          quantity: agg.quantity,
          revenue: agg.revenue,
          cost_of_goods: Math.round(agg.revenue * 0.4),
          gross_profit: agg.revenue - Math.round(agg.revenue * 0.4),
        }));
        return execution(call, rows, failTool);
      }
      case "period_comparison": {
        const current = sumDays(ranged);
        const prev = previousPeriodRange(from, to);
        const previousDays = dayRange(days, prev.from, prev.to, timezone);
        const previous = sumDays(previousDays);
        const revenueDelta = previous.net_revenue > 0
          ? Math.round(((current.net_revenue - previous.net_revenue) / previous.net_revenue) * 1000) / 10
          : null;
        const ordersDelta = previous.total_orders > 0
          ? Math.round(((current.total_orders - previous.total_orders) / previous.total_orders) * 1000) / 10
          : null;
        const profitDelta = previous.net_profit > 0
          ? Math.round(((current.net_profit - previous.net_profit) / previous.net_profit) * 1000) / 10
          : null;
        return execution(call, [{
          current_orders: current.total_orders,
          previous_orders: previous.total_orders,
          orders_delta_percent: ordersDelta,
          current_revenue: current.net_revenue,
          previous_revenue: previous.net_revenue,
          revenue_delta_percent: revenueDelta,
          current_profit: current.net_profit,
          previous_profit: previous.net_profit,
          profit_delta_percent: profitDelta,
        }], failTool);
      }
      case "forecast_revenue": {
        const dailyPoints = ranged.map((day) => ({
          date: day.date,
          revenue: day.revenue,
          orders: day.orders,
        }));
        const forecast = computeForecast(dailyPoints, 30);
        return execution(call, [forecast as unknown as Record<string, unknown>], failTool);
      }
      default:
        return execution(call, [], failTool);
    }
  });
}

/** Tương đương executeAiToolPlan thật nhưng dùng mock (wave 1/2) */
export async function mockExecuteAiToolPlan(
  calls: AiToolCall[],
  options: MockToolsOptions = {},
): Promise<AiToolExecution[]> {
  const effective: MockToolsOptions = {
    ...options,
    // scenario "tool-timeout" → làm fail sales_summary (như tool thật bị timeout)
    failTool: options.failTool ?? (options.scenario === "tool-timeout" ? "sales_summary" : null),
  };
  return mockExecuteToolPlan(calls, effective);
}
