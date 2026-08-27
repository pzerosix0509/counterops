import "server-only";
import { assessAiEvidence } from "@/lib/ai/assessment";
import { CATALOG_VERSION } from "@/lib/ai/metric-catalog";
import { redactPii } from "@/lib/ai/redact";
import { filterViolatingTools, validateToolPlan } from "@/lib/ai/policy";
import { aiDashboardSpecSchema } from "@/lib/ai/schemas";
import { buildAiPlanAsync, isDashboardIntent } from "@/lib/ai/semantic-layer";
import {
  buildAnalyticsContext,
  buildChartForQuestion,
  buildDashboardSpec,
  buildDeterministicAnswer,
  buildFallbackAnswer,
} from "@/server/ai/analytics";
import {
  appendAiAssistantMessage,
  appendAiUserMessage,
  ensureAiChatSession,
  findAiResponseByRequest,
  getConversationMemory,
  getConversationState,
  logAiRun,
  updateAiSessionMemory,
  updateConversationState,
} from "@/server/ai/conversations";
import { generateAiModelAnswer, type AiProviderResult } from "@/server/ai/provider";
import { runPlannerLoop } from "@/lib/ai/planner-loop";
import { runStatisticalAnalysis, describeStatisticalFindings } from "@/lib/ai/analysis";
import { buildSourcesFromToolExecutions } from "@/server/ai/tools";
import type { AiChatResponse, AiProgressStage, AiSource } from "@/types/ai";

export interface RunAiAnalysisInput {
  organizationId: string;
  branchId: string;
  userId: string;
  role: string;
  timezone: string;
  question: string;
  mode: "chat" | "dashboard";
  sessionId?: string;
  requestId?: string;
  imageText?: string;
  onProgress?: (stage: AiProgressStage, message: string) => void;
}

function emitProgress(
  callback: RunAiAnalysisInput["onProgress"],
  stage: AiProgressStage,
  message: string,
) {
  callback?.(stage, message);
}

function emptyProviderResult(): AiProviderResult {
  return {
    answer: null,
    provider: null,
    model: null,
    usage: null,
    attempts: [],
  };
}

export async function runAiAnalysis(input: RunAiAnalysisInput): Promise<AiChatResponse> {
  const startedAt = Date.now();
  const effectiveMode = input.mode === "dashboard" || isDashboardIntent(input.question) ? "dashboard" : "chat";
  const session = await ensureAiChatSession({
    sessionId: input.sessionId,
    organizationId: input.organizationId,
    branchId: input.branchId,
    userId: input.userId,
    mode: effectiveMode,
    firstQuestion: input.question,
  });
  if (input.requestId) {
    const existingResponse = await findAiResponseByRequest(session.id, input.requestId);
    if (existingResponse) return existingResponse;
  }

  const memory = await getConversationMemory(session.id);
  const memoryState = await getConversationState(session.id);
  const userMessageId = crypto.randomUUID();
  await appendAiUserMessage({
    id: userMessageId,
    organizationId: input.organizationId,
    branchId: input.branchId,
    sessionId: session.id,
    content: input.question,
    requestId: input.requestId,
  });

  emitProgress(input.onProgress, "planning", "Đang hiểu câu hỏi và chọn nguồn dữ liệu...");
  const plannerStartedAt = Date.now();
  const plan = await buildAiPlanAsync(
    input.question,
    effectiveMode,
    new Date(),
    memory.turns.filter((turn) => turn.role === "user").map((turn) => turn.content),
    input.timezone,
    memoryState,
  );
  const plannerMs = Date.now() - plannerStartedAt;

  // Structured memory: lưu range/metric/dimensions của lần hỏi này
  void updateConversationState(session.id, {
    lastRange: plan.range,
    lastMetric: plan.semanticQuery
      ? { key: plan.semanticQuery.metric, version: plan.semanticQuery.metricVersion }
      : undefined,
    lastDimensions: plan.semanticQuery?.dimensions,
    lastGrain: plan.semanticQuery?.grain,
    lastComparison: plan.semanticQuery?.comparison,
  }).catch(() => {});

  // If the user attached an image, force the pipeline to use the LLM so the
  // extracted image text is actually consumed (deterministic intents skip the model).
  const imageSource: AiSource | null = input.imageText
    ? {
      id: "IMG1",
      label: "Ảnh người dùng gửi",
      type: "document",
      detail: "Văn bản trích từ ảnh đính kèm",
      excerpt: input.imageText.slice(0, 4_000),
      meta: { tool: "image_to_text", source: "attachment" },
    }
    : null;
  let effectivePlan = input.imageText && plan.deterministic
    ? {
      ...plan,
      intent: "document_search" as const,
      intentConfidence: 0.9,
      modelTier: "fast" as const,
      deterministic: false,
      rationale: "Có ảnh đính kèm — cần mô hình để đọc nội dung ảnh.",
      tools: [{
        id: "tool-1",
        name: "search_documents" as const,
        arguments: { query: input.question, limit: 6 },
      }],
    }
    : plan;

  // Câu hỏi mơ hồ → hỏi lại ngay, không chạy tool/LLM (rẻ và nhanh)
  if (effectivePlan.clarification) {
    const clarification = effectivePlan.clarification;
    const assistantMessageId = crypto.randomUUID();
    const runId = crypto.randomUUID();
    const responseReadyMs = Date.now() - startedAt;
    const response: AiChatResponse = {
      answer: clarification.question,
      bullets: [],
      chart: null,
      dashboard: null,
      sources: [],
      modelUsed: null,
      usedFallback: false,
      sessionId: session.id,
      messageId: assistantMessageId,
      runId,
      toolCalls: [],
      usage: null,
      responseMode: "deterministic",
      intent: effectivePlan.intent,
      intentConfidence: effectivePlan.intentConfidence,
      confidence: {
        score: 1,
        level: "high",
        reasons: ["Câu hỏi cần làm rõ trước khi truy vấn."],
        sampleSize: null,
        components: {
          query: 1,
          dataCompleteness: 1,
          consistency: 1,
          analysisFit: 1,
          forecastReliability: null,
        },
      },
      qualityIssues: [],
      anomalies: [],
      telemetry: {
        plannerMs,
        toolsMs: 0,
        retrievalMs: 0,
        providerMs: 0,
        responseReadyMs,
        totalMs: responseReadyMs,
        cacheHits: 0,
        cacheMisses: 0,
        providerAttempts: [],
      },
      clarification: {
        question: clarification.question,
        options: clarification.options,
        reason: clarification.reason,
      },
    };
    await appendAiAssistantMessage({
      id: assistantMessageId,
      organizationId: input.organizationId,
      branchId: input.branchId,
      sessionId: session.id,
      response,
      requestId: input.requestId,
    });
    return response;
  }

  emitProgress(input.onProgress, "querying", "Đang truy vấn dữ liệu đã được phân quyền...");
  const toolsStartedAt = Date.now();
  // Policy validator: lọc tool vi phạm (role không đủ, search_web quá nhiều, tool lạ)
  const policyViolations = validateToolPlan(effectivePlan, {
    role: input.role,
    isDashboardMode: effectiveMode === "dashboard",
  });
  if (policyViolations.length > 0) {
    effectivePlan = {
      ...effectivePlan,
      tools: filterViolatingTools(effectivePlan.tools, policyViolations),
    };
  }
  const dataAsOf = new Date().toISOString();
  const snapshotId = crypto.randomUUID();
  const provenance = {
    asOf: dataAsOf,
    snapshotId,
    catalogVersion: CATALOG_VERSION,
    metricKey: effectivePlan.semanticQuery?.metric,
    metricVersion: effectivePlan.semanticQuery?.metricVersion,
  };
  const toolContext = {
    organizationId: input.organizationId,
    branchId: input.branchId,
    timezone: input.timezone,
    dataAsOf,
    snapshotId,
    catalogVersion: CATALOG_VERSION,
  };
  // Multi-step planner có budget: loop tối đa 3 vòng, tổng tool ≤ 8,
  // dừng sớm khi confidence đủ cao. Deterministic intents không loop.
  const loopResult = await runPlannerLoop({
    question: input.question,
    mode: effectiveMode,
    timezone: input.timezone,
    memory,
    state: memoryState,
    initialPlan: effectivePlan,
    toolContext,
    onProgress: (stage, message) => emitProgress(input.onProgress, stage as AiProgressStage, message),
  });
  const executions = loopResult.executions;
  const plannerRounds = loopResult.rounds;
  const plannerStoppedEarly = loopResult.stoppedEarly;

  const toolsMs = Date.now() - toolsStartedAt;
  const retrievalMs = executions
    .filter((execution) => execution.call.name === "search_documents")
    .reduce((sum, execution) => sum + execution.durationMs, 0);
  const cacheHits = executions.filter((execution) => execution.cacheHit).length;
  const cacheMisses = executions.filter((execution) =>
    execution.call.name !== "search_documents" && !execution.cacheHit,
  ).length;

  emitProgress(input.onProgress, "assessing", "Đang kiểm tra chất lượng và độ tin cậy...");
  const sources = [...buildSourcesFromToolExecutions(executions, provenance), ...(imageSource ? [imageSource] : [])];
  const analytics = buildAnalyticsContext(executions);
  const assessment = assessAiEvidence(analytics, executions, sources);
  // Statistical analysis: chạy cho diagnosis/trend khi đủ dữ liệu chuỗi thời gian
  const statisticalFindings = runStatisticalAnalysis(analytics, effectivePlan.intent);
  if (statisticalFindings) {
    analytics.statisticalFindings = statisticalFindings;
  }
  const chart = buildChartForQuestion(input.question, analytics);

  let modelResult = emptyProviderResult();
  let providerMs = 0;
  if (!effectivePlan.deterministic && effectivePlan.modelTier !== "none") {
    emitProgress(input.onProgress, "generating", "Đang tổng hợp câu trả lời...");
    const providerStartedAt = Date.now();
    modelResult = await generateAiModelAnswer({
      question: input.question,
      mode: effectiveMode,
      intent: effectivePlan.intent,
      sources,
      executions,
      memory,
      confidence: assessment.confidence,
      qualityIssues: assessment.qualityIssues,
      anomalies: assessment.anomalies,
      imageText: input.imageText,
      timezone: input.timezone,
      statisticalFindings: statisticalFindings
        ? describeStatisticalFindings(statisticalFindings)
        : undefined,
    }, effectivePlan.modelTier).catch((error) => ({
      ...emptyProviderResult(),
      error: error instanceof Error ? error.message : "Không gọi được AI provider.",
    }));
    providerMs = Date.now() - providerStartedAt;
  }

  const deterministic = buildDeterministicAnswer(
    effectivePlan,
    analytics,
    executions,
    sources,
    assessment,
  );
  const fallback = buildFallbackAnswer(input.question, analytics, sources);
  const responseMode = effectivePlan.deterministic
    ? "deterministic"
    : modelResult.answer ? "model" : "fallback";
  const answer = effectivePlan.deterministic
    ? deterministic.answer
    : modelResult.answer?.answer ?? fallback.answer;
  const bullets = effectivePlan.deterministic
    ? deterministic.bullets
    : modelResult.answer?.bullets ?? fallback.bullets;
  const modelDashboard = modelResult.answer?.dashboard
    ? aiDashboardSpecSchema.safeParse(modelResult.answer.dashboard)
    : null;
  const dashboard = effectivePlan.intent === "dashboard"
    ? modelDashboard?.success ? modelDashboard.data : buildDashboardSpec(analytics)
    : modelDashboard?.success ? modelDashboard.data : null;
  const usedFallback = responseMode === "fallback";

  const assistantMessageId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  const responseReadyMs = Date.now() - startedAt;
  const response: AiChatResponse = {
    answer,
    bullets,
    chart,
    dashboard,
    sources,
    modelUsed: modelResult.model,
    usedFallback,
    fallbackReason: usedFallback ? modelResult.error : undefined,
    sessionId: session.id,
    messageId: assistantMessageId,
    runId,
    toolCalls: effectivePlan.tools,
    usage: modelResult.usage,
    responseMode,
    intent: effectivePlan.intent,
    intentConfidence: effectivePlan.intentConfidence,
    confidence: assessment.confidence,
    qualityIssues: assessment.qualityIssues,
    anomalies: assessment.anomalies,
    telemetry: {
      plannerMs,
      toolsMs,
      retrievalMs,
      providerMs,
      responseReadyMs,
      totalMs: responseReadyMs,
      cacheHits,
      cacheMisses,
      providerAttempts: modelResult.attempts,
      plannerRounds,
      plannerStoppedEarly,
    },
  };

  emitProgress(input.onProgress, "persisting", "Đang lưu hội thoại...");
  await appendAiAssistantMessage({
    id: assistantMessageId,
    organizationId: input.organizationId,
    branchId: input.branchId,
    sessionId: session.id,
    response,
    requestId: input.requestId,
  });

  const toolErrors = executions
    .filter((execution) => execution.error)
    .map((execution) => `${execution.call.name}: ${execution.error}`)
    .join("; ");
  response.telemetry.totalMs = Date.now() - startedAt;
  await Promise.allSettled([
    updateAiSessionMemory(session.id),
    logAiRun({
      id: runId,
      organizationId: input.organizationId,
      branchId: input.branchId,
      userId: input.userId,
      sessionId: session.id,
      assistantMessageId,
      mode: effectiveMode,
      provider: modelResult.provider,
      model: modelResult.model,
      status: usedFallback ? "fallback" : "success",
      intent: effectivePlan.intent,
      responseMode,
      confidenceScore: assessment.confidence.score,
      telemetry: response.telemetry,
      toolCalls: redactPii(executions.map((execution) => ({
        ...execution.call,
        durationMs: execution.durationMs,
        cacheHit: execution.cacheHit,
        error: execution.error,
      }))),
      sourceCount: sources.length,
      usage: modelResult.usage,
      latencyMs: response.telemetry.totalMs,
      fallbackReason: usedFallback ? modelResult.error : undefined,
      errorMessage: toolErrors || undefined,
    }),
  ]);

  return response;
}
