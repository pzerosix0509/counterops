import "server-only";
import { assessAiEvidence } from "@/lib/ai/assessment";
import { aiDashboardSpecSchema } from "@/lib/ai/schemas";
import { buildAiPlan, isDashboardIntent } from "@/lib/ai/semantic-layer";
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
import type { AiChatResponse, AiProgressStage } from "@/types/ai";

export interface RunAiAnalysisInput {
  organizationId: string;
  branchId: string;
  userId: string;
  timezone: string;
  question: string;
  mode: "chat" | "dashboard";
  sessionId?: string;
  requestId?: string;
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
  const plan = buildAiPlan(
    input.question,
    effectiveMode,
    new Date(),
    memory.turns.filter((turn) => turn.role === "user").map((turn) => turn.content),
  );
  const plannerMs = Date.now() - plannerStartedAt;

  emitProgress(input.onProgress, "querying", "Đang truy vấn dữ liệu đã được phân quyền...");
  const toolsStartedAt = Date.now();
  const executions = await executeAiToolPlan(plan.tools, {
    organizationId: input.organizationId,
    branchId: input.branchId,
    timezone: input.timezone,
  });
  const toolsMs = Date.now() - toolsStartedAt;
  const retrievalMs = executions
    .filter((execution) => execution.call.name === "search_documents")
    .reduce((sum, execution) => sum + execution.durationMs, 0);
  const cacheHits = executions.filter((execution) => execution.cacheHit).length;
  const cacheMisses = executions.filter((execution) =>
    execution.call.name !== "search_documents" && !execution.cacheHit,
  ).length;

  emitProgress(input.onProgress, "assessing", "Đang kiểm tra chất lượng và độ tin cậy...");
  const sources = buildSourcesFromToolExecutions(executions);
  const analytics = buildAnalyticsContext(executions);
  const assessment = assessAiEvidence(analytics, executions, sources);
  const chart = buildChartForQuestion(input.question, analytics);

  let modelResult = emptyProviderResult();
  let providerMs = 0;
  if (!plan.deterministic && plan.modelTier !== "none") {
    emitProgress(input.onProgress, "generating", "Đang tổng hợp câu trả lời...");
    const providerStartedAt = Date.now();
    modelResult = await generateAiModelAnswer({
      question: input.question,
      mode: effectiveMode,
      sources,
      executions,
      memory,
      confidence: assessment.confidence,
      qualityIssues: assessment.qualityIssues,
      anomalies: assessment.anomalies,
    }, plan.modelTier).catch((error) => ({
      ...emptyProviderResult(),
      error: error instanceof Error ? error.message : "Không gọi được AI provider.",
    }));
    providerMs = Date.now() - providerStartedAt;
  }

  const deterministic = buildDeterministicAnswer(
    plan,
    analytics,
    executions,
    sources,
    assessment,
  );
  const fallback = buildFallbackAnswer(input.question, analytics, sources);
  const responseMode = plan.deterministic
    ? "deterministic"
    : modelResult.answer ? "model" : "fallback";
  const answer = plan.deterministic
    ? deterministic.answer
    : modelResult.answer?.answer ?? fallback.answer;
  const bullets = plan.deterministic
    ? deterministic.bullets
    : modelResult.answer?.bullets ?? fallback.bullets;
  const modelDashboard = modelResult.answer?.dashboard
    ? aiDashboardSpecSchema.safeParse(modelResult.answer.dashboard)
    : null;
  const dashboard = plan.intent === "dashboard"
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
    toolCalls: plan.tools,
    usage: modelResult.usage,
    responseMode,
    intent: plan.intent,
    intentConfidence: plan.intentConfidence,
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
      intent: plan.intent,
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
