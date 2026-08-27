/**
 * Eval runner 3 lớp:
 * - planning: câu hỏi → intent/tools/range/semantic-query đúng (không gọi model).
 * - numbers: ground-truth số trên synthetic dataset (mock tools) → deterministic answer khớp.
 * - quality: data-quality scenarios (missing/duplicate/refund/outlier/timeout/empty/small)
 *   + ambiguity phải hỏi lại, không đoán.
 * Mọi case fail đều ghi `steps` chi tiết (debug kiểu Fabric).
 */
import { buildAiPlan } from "@/lib/ai/semantic-layer";
import { buildAnalyticsContext, buildDeterministicAnswer, buildFallbackAnswer } from "@/server/ai/analytics";
import { assessAiEvidence } from "@/lib/ai/assessment";
import { buildSourcesFromToolExecutions } from "@/server/ai/tools";
import { getEvalQueries, type VerifiedQuery } from "@/lib/ai/eval/load-verified";
import { mockExecuteAiToolPlan, type MockToolsOptions } from "@/lib/ai/eval/mock-tools";

export type EvalLayer = "planning" | "numbers" | "quality";

export interface EvalResult {
  caseId: string;
  question: string;
  passed: boolean;
  checks: Record<string, { expected: unknown; actual: unknown; passed: boolean }>;
  error?: string;
  steps: string[];
}

export interface RunEvalOptions {
  layer?: EvalLayer;
  scenario?: MockToolsOptions["scenario"];
  now?: Date;
}

export interface EvalSuiteResult {
  layer: EvalLayer;
  cases: EvalResult[];
  passed: number;
  total: number;
  accuracy: number;
}

const TOLERANCE_PCT = 0.005; // 0.5% cho lookup/comparison
const FORECAST_TOLERANCE_PCT = 0.3; // ±30% cho dự báo

function inTolerance(expected: number, actual: number, pct: number): boolean {
  if (expected === 0) return actual === 0;
  return Math.abs(actual - expected) / Math.abs(expected) <= pct;
}

function buildEvalPlan(query: VerifiedQuery, now: Date) {
  return buildAiPlan(query.question, "chat", now);
}

/** Lớp planning: intent/tools/range/query/clarification từ buildAiPlan */
function evalPlanningCase(query: VerifiedQuery, now: Date): EvalResult {
  const steps: string[] = [];
  const checks: EvalResult["checks"] = {};
  let passed = true;

  const plan = buildEvalPlan(query, now);
  steps.push(`intent=${plan.intent}, range=${plan.range.label}, tools=${plan.tools.map((t) => t.name).join(",")}`);

  if (query.expectedIntent) {
    const ok = plan.intent === query.expectedIntent;
    checks.intent = { expected: query.expectedIntent, actual: plan.intent, passed: ok };
    if (!ok) passed = false;
  }
  if (query.expectedTools) {
    const actual = plan.tools.map((t) => t.name);
    const ok = actual.length === query.expectedTools.length
      && query.expectedTools.every((tool, i) => tool === actual[i]);
    checks.tools = { expected: query.expectedTools, actual, passed: ok };
    if (!ok) passed = false;
  }
  if (query.expectedRangeLabel) {
    const ok = plan.range.label === query.expectedRangeLabel;
    checks.range = { expected: query.expectedRangeLabel, actual: plan.range.label, passed: ok };
    if (!ok) passed = false;
  }
  if (query.semanticQuery) {
    const actual = plan.semanticQuery;
    const ok = actual != null
      && actual.metric === query.semanticQuery.metric
      && actual.grain === (query.semanticQuery.grain ?? "day")
      && (query.semanticQuery.dimensions ?? []).every((d) => actual.dimensions.includes(d as never));
    checks.query = { expected: query.semanticQuery, actual: actual ? { metric: actual.metric, dimensions: actual.dimensions, grain: actual.grain, comparison: actual.comparison } : null, passed: ok };
    if (!ok) passed = false;
  }
  if (query.expectedClarification != null) {
    const actual = plan.clarification != null;
    const ok = actual === query.expectedClarification;
    checks.clarification = { expected: query.expectedClarification, actual, passed: ok };
    if (!ok) passed = false;
  }

  return { caseId: query.id, question: query.question, passed, checks, steps };
}

/** Lớp numbers: ground-truth số qua mock tools + deterministic pipeline */
async function evalNumbersCase(query: VerifiedQuery, now: Date): Promise<EvalResult> {
  const steps: string[] = [];
  const checks: EvalResult["checks"] = {};
  let passed = true;

  const plan = buildEvalPlan(query, now);
  const executions = await mockExecuteAiToolPlan(plan.tools);
  const analytics = buildAnalyticsContext(executions);
  const provenance = {
    asOf: now.toISOString(),
    snapshotId: "eval-snapshot",
    catalogVersion: "2.0.0",
  };
  const sources = buildSourcesFromToolExecutions(executions, provenance);
  const assessment = assessAiEvidence(analytics, executions, sources);
  const answer = buildDeterministicAnswer(plan, analytics, executions, sources, assessment);
  steps.push(`answer.bullets=${JSON.stringify(answer.bullets.slice(0, 3))}`);

  const expected = query.expectedValue ?? {};

  // net_revenue / net_profit / total_orders
  for (const key of ["net_revenue", "net_profit", "cost_of_goods", "channel_fees", "gross_profit", "total_orders"]) {
    if (key in expected && analytics.salesSummary) {
      const actual = Number(analytics.salesSummary[key as keyof typeof analytics.salesSummary] ?? 0);
      const ok = inTolerance(Number(expected[key]), actual, TOLERANCE_PCT);
      checks[`value_${key}`] = { expected: expected[key], actual, passed: ok };
      if (!ok) passed = false;
    }
  }
  // topProduct / topChannel
  if ("topProduct" in expected) {
    const actual = analytics.topProducts[0]?.product_name ?? null;
    const ok = actual === expected.topProduct;
    checks.topProduct = { expected: expected.topProduct, actual, passed: ok };
    if (!ok) passed = false;
  }
  if ("topChannel" in expected) {
    const sorted = [...analytics.channelSummary].sort((a, b) => b.revenue - a.revenue);
    const actual = sorted[0]?.channel_name ?? null;
    const ok = actual === expected.topChannel;
    checks.topChannel = { expected: expected.topChannel, actual, passed: ok };
    if (!ok) passed = false;
  }
  // forecast: điểm đầu trong biên ±30% của doanh thu trung bình 30 ngày
  if ("forecastRevenue" in expected && analytics.forecastRevenue?.points[0]) {
    const actual = analytics.forecastRevenue.points[0].forecasted_revenue;
    const ok = inTolerance(Number(expected.forecastRevenue), actual, FORECAST_TOLERANCE_PCT);
    checks.forecastRevenue = { expected: expected.forecastRevenue, actual, passed: ok };
    if (!ok) passed = false;
  }

  // requiredSources phải có trong sources
  if (query.requiredSources && query.requiredSources.length > 0) {
    const sourceTools = sources.map((s) => s.meta?.tool).filter(Boolean) as string[];
    const missing = query.requiredSources.filter((tool) => !sourceTools.includes(tool));
    const ok = missing.length === 0;
    checks.sources = { expected: query.requiredSources, actual: sourceTools, passed: ok };
    steps.push(`sources=${sourceTools.join(",")}`);
    if (!ok) passed = false;
  }

  // intent deterministic không được rơi vào fallback
  if (plan.deterministic && answer.bullets.length === 0) {
    checks.deterministicAnswer = { expected: "non-empty", actual: "empty", passed: false };
    passed = false;
  }

  return { caseId: query.id, question: query.question, passed, checks, steps };
}

/** Lớp quality: data-quality scenario + ambiguity phải hỏi lại */
async function evalQualityCase(query: VerifiedQuery, now: Date): Promise<EvalResult> {
  const steps: string[] = [];
  const checks: EvalResult["checks"] = {};
  let passed = true;

  const plan = buildEvalPlan(query, now);
  steps.push(`intent=${plan.intent}, clarification=${plan.clarification != null}`);

  // Ambiguity: expectedClarification=true → phải có clarification
  if (query.expectedClarification === true) {
    const ok = plan.clarification != null;
    checks.clarification = { expected: true, actual: plan.clarification != null, passed: ok };
    if (!ok) {
      passed = false;
      steps.push("FAIL: câu mơ hồ nhưng không hỏi lại — đã đoán intent 1 chiều");
    }
    return { caseId: query.id, question: query.question, passed, checks, steps };
  }

  // Data-quality: chạy scenario (mặc định base) qua mock tools
  const executions = await mockExecuteAiToolPlan(plan.tools, {
    scenario: (query.scenario ?? "base") as MockToolsOptions["scenario"],
  });
  const analytics = buildAnalyticsContext(executions);
  const provenance = {
    asOf: now.toISOString(),
    snapshotId: "eval-snapshot",
    catalogVersion: "2.0.0",
  };
  const sources = buildSourcesFromToolExecutions(executions, provenance);
  const assessment = assessAiEvidence(analytics, executions, sources);
  const answer = buildDeterministicAnswer(plan, analytics, executions, sources, assessment);
  const fallback = buildFallbackAnswer(query.question, analytics, sources);
  steps.push(`qualityIssues=${assessment.qualityIssues.map((q) => q.code).join(",")}`);
  steps.push(`anomalies=${assessment.anomalies.length}, confidence=${assessment.confidence.score}`);

  // Issue mong đợi phải xuất hiện
  if (query.expectedQualityIssues && query.expectedQualityIssues.length > 0) {
    const actualCodes = assessment.qualityIssues.map((q) => q.code);
    const missing = query.expectedQualityIssues.filter((code) => !actualCodes.includes(code));
    const ok = missing.length === 0;
    checks.qualityIssues = { expected: query.expectedQualityIssues, actual: actualCodes, passed: ok };
    if (!ok) passed = false;
  }

  // Anomaly mong đợi theo scenario
  if (query.scenario === "outlier-day" && query.expectedAnomalyDate) {
    const hasAnomaly = assessment.anomalies.some((a) =>
      `${a.title} ${a.description}`.includes(query.expectedAnomalyDate!),
    );
    checks.anomaly = {
      expected: query.expectedAnomalyDate,
      actual: assessment.anomalies.map((a) => `${a.code}: ${a.description}`).join(" | ") || "không có anomaly",
      passed: hasAnomaly,
    };
    if (!hasAnomaly) passed = false;
  }

  // tool-timeout: fallback answer không được bịa số — không có sales summary nên nói thiếu dữ liệu
  if (query.scenario === "tool-timeout") {
    const ok = answer.bullets.some((b) => /thiếu|không lấy được|lỗi/i.test(b)) || fallback.bullets.some((b) => /thiếu|không lấy được|lỗi/i.test(b));
    checks.noFabrication = { expected: "caveat về lỗi/thiếu dữ liệu", actual: answer.bullets.join(" | ") || fallback.bullets.join(" | "), passed: ok };
    if (!ok) passed = false;
  }

  // empty-period: phải có caveat "chưa có đơn/trống"
  if (query.scenario === "empty-period") {
    const ok = answer.bullets.some((b) => /chưa có|trống|không có/i.test(b)) || fallback.bullets.some((b) => /chưa có|trống|không có/i.test(b));
    checks.emptyPeriodCaveat = { expected: "caveat kỳ trống", actual: answer.bullets.join(" | "), passed: ok };
    if (!ok) passed = false;
  }

  // Kỳ hiện tại chưa hoàn tất: câu "đến giờ" → range không vượt quá hiện tại + caveat
  if (/đến giờ|hiện tại|chưa hoàn tất/i.test(query.question)) {
    const to = analytics.range.to;
    const nowIso = now.toISOString();
    const ok = to <= nowIso;
    checks.currentPeriod = { expected: `to <= ${nowIso}`, actual: to, passed: ok };
    if (!ok) passed = false;
  }

  return { caseId: query.id, question: query.question, passed, checks, steps };
}

export async function runEvalSuite(opts: RunEvalOptions = {}): Promise<EvalSuiteResult> {
  const layer: EvalLayer = opts.layer ?? "planning";
  const now = opts.now ?? new Date("2026-08-04T12:00:00+07:00");
  const queries = getEvalQueries().filter((q) => (q.layer ?? "planning") === layer);

  const cases: EvalResult[] = [];
  for (const query of queries) {
    try {
      if (layer === "planning") {
        cases.push(evalPlanningCase(query, now));
      } else if (layer === "numbers") {
        cases.push(await evalNumbersCase(query, now));
      } else {
        cases.push(await evalQualityCase(query, now));
      }
    } catch (error) {
      cases.push({
        caseId: query.id,
        question: query.question,
        passed: false,
        checks: {},
        error: error instanceof Error ? error.message : String(error),
        steps: ["exception"],
      });
    }
  }

  const passed = cases.filter((c) => c.passed).length;
  return {
    layer,
    cases,
    passed,
    total: cases.length,
    accuracy: cases.length === 0 ? 1 : passed / cases.length,
  };
}
