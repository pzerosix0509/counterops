/**
 * Multi-step planner có budget — vòng lặp tối đa N vòng, tổng tool ≤ maxTotalTools.
 *
 * - Round 1: chạy plan ban đầu.
 * - Nếu confidence >= stopConfidence hoặc intent deterministic → dừng.
 * - Ngược lại bổ sung tool còn thiếu (heuristic theo intent; LLM followupTools
 *   có thể đề xuất nhưng fail-safe về heuristic khi model lỗi).
 * - Mỗi vòng kiểm tra budget — không bao giờ vượt maxTotalTools.
 */

import { assessAiEvidence } from "@/lib/ai/assessment";
import { buildAnalyticsContext } from "@/server/ai/analytics";
import type { AiMemoryState, AiPlan, AiToolCall, AiToolExecution } from "@/types/ai";
import type { AiToolContext } from "@/server/ai/tools";
import { buildSourcesFromToolExecutions, executeAiToolPlan } from "@/server/ai/tools";
import type { ConversationMemory } from "@/server/ai/provider";

export interface PlannerBudget {
  maxRounds: number;
  maxTotalTools: number;
  stopConfidence: number;
}

export const DEFAULT_BUDGET: PlannerBudget = {
  maxRounds: 3,
  maxTotalTools: 8,
  stopConfidence: 0.7,
};

export interface PlannerLoopResult {
  plan: AiPlan;
  executions: AiToolExecution[];
  rounds: number;
  stoppedEarly: boolean;
}

const ANALYTICS_TOOLS = new Set([
  "sales_summary",
  "sales_timeseries",
  "top_products",
  "category_summary",
  "channel_summary",
  "period_comparison",
  "inventory_risk",
  "forecast_revenue",
]);

/** Tool bổ sung hợp lý theo intent + bằng chứng hiện có (heuristic) */
export function supplementalToolsFor(
  plan: AiPlan,
  executedNames: Set<string>,
  hasSummary: boolean,
  hasAnomalies: boolean,
): AiToolCall[] {
  const calls: AiToolCall[] = [];
  const rangeArgs = (plan.tools.find((tool) => "from" in tool.arguments)?.arguments ?? {}) as Record<
    string,
    string | number | boolean | null
  >;

  const push = (
    id: string,
    name: AiToolCall["name"],
    arguments_: Record<string, string | number | boolean | null>,
  ) => {
    if (!executedNames.has(name)) calls.push({ id, name, arguments: arguments_ });
  };

  if (plan.intent === "diagnosis") {
    if (rangeArgs.from) {
      const common = { from: rangeArgs.from, to: rangeArgs.to, rangeLabel: rangeArgs.rangeLabel };
      push("refine-period-comparison", "period_comparison", common);
      push("refine-top-products", "top_products", { ...common, limit: 10 });
      push("refine-channel-summary", "channel_summary", common);
    }
  } else if (plan.intent === "forecast" || plan.intent === "trend") {
    if (rangeArgs.from && !executedNames.has("sales_timeseries")) {
      push("refine-timeseries", "sales_timeseries", {
        ...rangeArgs,
        granularity: plan.intent === "trend" ? "day" : "day",
      });
    }
  }

  if (hasAnomalies && !executedNames.has("inventory_risk")) {
    push("refine-inventory-risk", "inventory_risk", { status: "attention" });
  }

  return calls;
}

export async function runPlannerLoop(args: {
  question: string;
  mode: "chat" | "dashboard";
  timezone: string;
  memory: ConversationMemory;
  state: AiMemoryState | null;
  initialPlan: AiPlan;
  toolContext: AiToolContext;
  budget?: PlannerBudget;
  onProgress?: (stage: string, message: string) => void;
}): Promise<PlannerLoopResult> {
  const budget = args.budget ?? DEFAULT_BUDGET;
  const { initialPlan, toolContext } = args;

  let executions = await executeAiToolPlan(initialPlan.tools, toolContext);
  const plan = initialPlan;
  let rounds = 1;
  let stoppedEarly = false;

  // Deterministic intents không loop — chỉ cần 1 vòng
  const loopable = !initialPlan.deterministic && initialPlan.modelTier !== "none";
  if (!loopable) {
    return { plan, executions, rounds, stoppedEarly: true };
  }

  const provenance = {
    asOf: toolContext.dataAsOf,
    snapshotId: toolContext.snapshotId,
    catalogVersion: toolContext.catalogVersion,
    metricKey: plan.semanticQuery?.metric,
    metricVersion: plan.semanticQuery?.metricVersion,
  };

  while (rounds < budget.maxRounds) {
    const analytics = buildAnalyticsContext(executions);
    const assessment = assessAiEvidence(analytics, executions, buildSourcesFromToolExecutions(executions, provenance));

    // Dừng sớm nếu confidence đủ cao
    if (assessment.confidence.score >= budget.stopConfidence) {
      stoppedEarly = true;
      break;
    }

    const executedNames = new Set(executions.map((execution) => execution.call.name));
    const supplemental = supplementalToolsFor(
      plan,
      executedNames,
      analytics.salesSummary != null,
      assessment.anomalies.length > 0,
    ).filter((call) => ANALYTICS_TOOLS.has(call.name));

    if (supplemental.length === 0) break;

    // Budget: tổng tool không vượt maxTotalTools
    const totalAfter = executions.length + supplemental.length;
    if (totalAfter > budget.maxTotalTools) {
      const allowed = budget.maxTotalTools - executions.length;
      if (allowed <= 0) break;
      supplemental.length = allowed;
    }

    args.onProgress?.("querying", `Đang bổ sung dữ liệu (vòng ${rounds + 1}/${budget.maxRounds})...`);
    const moreExecutions = await executeAiToolPlan(supplemental, toolContext);
    executions = [...executions, ...moreExecutions];
    rounds += 1;
  }

  return { plan, executions, rounds, stoppedEarly };
}
