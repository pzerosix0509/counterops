import "server-only";
import { assessAiEvidence } from "@/lib/ai/assessment";
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
  logAiRun,
  updateAiSessionMemory,
} from "@/server/ai/conversations";
import { generateAiModelAnswer, type AiProviderResult } from "@/server/ai/provider";
import { buildSourcesFromToolExecutions, executeAiToolPlan } from "@/server/ai/tools";
import type { AiChatResponse, AiProgressStage, AiSource, AiToolCall } from "@/types/ai";

export interface RunAiAnalysisInput {
  organizationId: string;
  branchId: string;
  userId: string;
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
  );
  const plannerMs = Date.now() - plannerStartedAt;

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
  const effectivePlan = input.imageText && plan.deterministic
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

  emitProgress(input.onProgress, "querying", "Đang truy vấn dữ liệu đã được phân quyền...");
  const toolsStartedAt = Date.now();
  const toolContext = {
    organizationId: input.organizationId,
    branchId: input.branchId,
    timezone: input.timezone,
  };
  let executions = await executeAiToolPlan(effectivePlan.tools, toolContext);

  // Agentic loop: if confidence is low after first pass, run supplemental tools
  // that weren't in the original plan (up to 1 refinement round).
  const firstPassAnalytics = buildAnalyticsContext(executions);
  const firstPassAssessment = assessAiEvidence(firstPassAnalytics, executions, buildSourcesFromToolExecutions(executions));
  if (firstPassAssessment.confidence.score < 0.6 && effectivePlan.modelTier !== "none") {
    const rangeCall = effectivePlan.tools.find((tool) => "from" in tool.arguments);
    const rangeArgs = rangeCall?.arguments as { from: string; to: string; rangeLabel: string } | undefined;
    const executedNames = new Set(executions.map((execution) => execution.call.name));
    const supplementalCalls: AiToolCall[] = [];

    // Add period_comparison if missing and we have sales data (helps explain drops/spikes)
    if (!executedNames.has("period_comparison") && firstPassAnalytics.salesSummary && rangeArgs) {
      supplementalCalls.push({
        id: "refine-period-comparison",
        name: "period_comparison",
        arguments: { from: rangeArgs.from, to: rangeArgs.to, rangeLabel: rangeArgs.rangeLabel },
      });
    }
    // Add top_products if missing and revenue data exists (helps diagnose anomalies)
    if (!executedNames.has("top_products") && firstPassAnalytics.salesSummary?.total_orders && rangeArgs) {
      supplementalCalls.push({
        id: "refine-top-products",
        name: "top_products",
        arguments: { from: rangeArgs.from, to: rangeArgs.to, rangeLabel: rangeArgs.rangeLabel, limit: 10 },
      });
    }
    // Add inventory_risk if there are anomalies but no inventory context
    if (!executedNames.has("inventory_risk") && firstPassAssessment.anomalies.length > 0) {
      supplementalCalls.push({
        id: "refine-inventory-risk",
        name: "inventory_risk",
        arguments: { status: "attention" },
      });
    }

    if (supplementalCalls.length > 0) {
      emitProgress(input.onProgress, "querying", "Đang bổ sung dữ liệu để tăng độ tin cậy...");
      const supplementalExecutions = await executeAiToolPlan(supplementalCalls, toolContext);
      executions = [...executions, ...supplementalExecutions];
    }
  }

  const toolsMs = Date.now() - toolsStartedAt;
  const retrievalMs = executions
    .filter((execution) => execution.call.name === "search_documents")
    .reduce((sum, execution) => sum + execution.durationMs, 0);
  const cacheHits = executions.filter((execution) => execution.cacheHit).length;
  const cacheMisses = executions.filter((execution) =>
    execution.call.name !== "search_documents" && !execution.cacheHit,
  ).length;

  emitProgress(input.onProgress, "assessing", "Đang kiểm tra chất lượng và độ tin cậy...");
  const sources = [...buildSourcesFromToolExecutions(executions), ...(imageSource ? [imageSource] : [])];
  const analytics = buildAnalyticsContext(executions);
  const assessment = assessAiEvidence(analytics, executions, sources);
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
      toolCalls: executions.map((execution) => ({
        ...execution.call,
        durationMs: execution.durationMs,
        cacheHit: execution.cacheHit,
        error: execution.error,
      })),
      sourceCount: sources.length,
      usage: modelResult.usage,
      latencyMs: response.telemetry.totalMs,
      fallbackReason: usedFallback ? modelResult.error : undefined,
      errorMessage: toolErrors || undefined,
    }),
  ]);

  return response;
}
