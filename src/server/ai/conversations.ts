import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  AiChatResponse,
  AiChatSessionSummary,
  AiIntent,
  AiModelUsage,
  AiResponseMode,
  AiStoredChatMessage,
  AiTelemetry,
  AiToolCall,
  AiUsageSummary,
} from "@/types/ai";
import type { Json } from "@/types/database";
import type { ConversationMemory } from "@/server/ai/provider";

const RECENT_MEMORY_TURNS = 10;

function sessionTitle(question: string) {
  const normalized = question.replace(/\s+/g, " ").trim();
  return normalized.length <= 72 ? normalized : `${normalized.slice(0, 69)}...`;
}

export async function listAiChatSessions(
  organizationId: string,
  branchId: string,
  userId: string,
): Promise<AiChatSessionSummary[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_chat_sessions")
    .select("id, title, mode, message_count, last_message_at, created_at")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(30);
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    mode: row.mode,
    messageCount: row.message_count,
    lastMessageAt: row.last_message_at,
    createdAt: row.created_at,
  }));
}

export async function getAiUsageSummary(
  organizationId: string,
  branchId: string,
): Promise<AiUsageSummary> {
  const supabase = createSupabaseServerClient();
  const from = new Date();
  from.setDate(from.getDate() - 29);
  from.setHours(0, 0, 0, 0);
  const { data, error } = await supabase.rpc("ai_usage_summary", {
    p_org_id: organizationId,
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: new Date().toISOString(),
  });
  const row = data?.[0];
  if (error || !row) {
    return { totalRuns: 0, totalTokens: 0, estimatedCostUsd: 0, fallbackRuns: 0, averageLatencyMs: 0 };
  }
  return {
    totalRuns: Number(row.total_runs),
    totalTokens: Number(row.total_tokens),
    estimatedCostUsd: Number(row.estimated_cost_usd),
    fallbackRuns: Number(row.fallback_runs),
    averageLatencyMs: Number(row.average_latency_ms),
  };
}

export async function listAiChatMessages(sessionId: string): Promise<AiStoredChatMessage[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_chat_messages")
    .select("id, role, content, response_json, created_at")
    .eq("session_id", sessionId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(200);
  if (error) throw new Error(error.message);

  const assistantIds = (data ?? []).filter((row) => row.role === "assistant").map((row) => row.id);
  const feedbackByMessage = new Map<string, -1 | 1>();
  if (assistantIds.length > 0) {
    const { data: feedback } = await supabase
      .from("ai_message_feedback")
      .select("message_id, rating")
      .in("message_id", assistantIds);
    for (const row of feedback ?? []) feedbackByMessage.set(row.message_id, row.rating);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    role: row.role as "user" | "assistant",
    content: row.content,
    response: row.response_json as unknown as AiChatResponse | null,
    createdAt: row.created_at,
    feedback: feedbackByMessage.get(row.id) ?? null,
  }));
}

export async function ensureAiChatSession(args: {
  sessionId?: string;
  organizationId: string;
  branchId: string;
  userId: string;
  mode: "chat" | "dashboard";
  firstQuestion: string;
}) {
  const supabase = createSupabaseServerClient();
  if (args.sessionId) {
    const { data, error } = await supabase
      .from("ai_chat_sessions")
      .select("*")
      .eq("id", args.sessionId)
      .eq("organization_id", args.organizationId)
      .eq("branch_id", args.branchId)
      .eq("user_id", args.userId)
      .is("archived_at", null)
      .maybeSingle();
    if (error || !data) throw new Error("Cuộc trò chuyện không tồn tại hoặc bạn không có quyền truy cập.");
    return data;
  }

  const { data, error } = await supabase
    .from("ai_chat_sessions")
    .insert({
      organization_id: args.organizationId,
      branch_id: args.branchId,
      user_id: args.userId,
      title: sessionTitle(args.firstQuestion),
      mode: args.mode,
    })
    .select("*")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Không tạo được cuộc trò chuyện.");
  return data;
}

export async function getConversationMemory(sessionId: string): Promise<ConversationMemory> {
  const supabase = createSupabaseServerClient();
  const [{ data: session }, { data: messages }] = await Promise.all([
    supabase
      .from("ai_chat_sessions")
      .select("memory_summary")
      .eq("id", sessionId)
      .single(),
    supabase
      .from("ai_chat_messages")
      .select("role, content, created_at")
      .eq("session_id", sessionId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(RECENT_MEMORY_TURNS),
  ]);
  return {
    summary: session?.memory_summary ?? null,
    turns: (messages ?? [])
      .reverse()
      .map((row) => ({ role: row.role as "user" | "assistant", content: row.content })),
  };
}

export async function findAiResponseByRequest(
  sessionId: string,
  requestId: string,
): Promise<AiChatResponse | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_chat_messages")
    .select("response_json")
    .eq("session_id", sessionId)
    .eq("client_request_id", requestId)
    .eq("role", "assistant")
    .maybeSingle();
  if (error || !data?.response_json) return null;
  return data.response_json as unknown as AiChatResponse;
}

export async function appendAiUserMessage(args: {
  id: string;
  organizationId: string;
  branchId: string;
  sessionId: string;
  content: string;
  requestId?: string;
}) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ai_chat_messages").insert({
    id: args.id,
    organization_id: args.organizationId,
    branch_id: args.branchId,
    session_id: args.sessionId,
    role: "user",
    content: args.content,
    client_request_id: args.requestId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function appendAiAssistantMessage(args: {
  id: string;
  organizationId: string;
  branchId: string;
  sessionId: string;
  response: AiChatResponse;
  requestId?: string;
}) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ai_chat_messages").insert({
    id: args.id,
    organization_id: args.organizationId,
    branch_id: args.branchId,
    session_id: args.sessionId,
    role: "assistant",
    content: args.response.answer,
    response_json: args.response as unknown as Json,
    tool_calls: args.response.toolCalls as unknown as Json,
    sources: args.response.sources as unknown as Json,
    model_used: args.response.modelUsed,
    client_request_id: args.requestId ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function updateAiSessionMemory(sessionId: string) {
  const supabase = createSupabaseServerClient();
  const { data: messages, count } = await supabase
    .from("ai_chat_messages")
    .select("role, content, created_at", { count: "exact" })
    .eq("session_id", sessionId)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: false })
    .limit(40);
  const chronological = (messages ?? []).reverse();
  const older = chronological.slice(0, Math.max(0, chronological.length - RECENT_MEMORY_TURNS));
  const memorySummary = older.length > 0
    ? older
      .map((message) => `${message.role === "user" ? "Người dùng" : "Trợ lý"}: ${message.content.slice(0, 320)}`)
      .join("\n")
      .slice(-6000)
    : null;
  const { error } = await supabase
    .from("ai_chat_sessions")
    .update({
      memory_summary: memorySummary,
      message_count: count ?? chronological.length,
      last_message_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (error) throw new Error(error.message);
}

export async function logAiRun(args: {
  id: string;
  organizationId: string;
  branchId: string;
  userId: string;
  sessionId: string;
  assistantMessageId: string;
  mode: "chat" | "dashboard";
  provider: string | null;
  model: string | null;
  status: "success" | "fallback" | "error";
  intent: AiIntent;
  responseMode: AiResponseMode;
  confidenceScore: number;
  telemetry: AiTelemetry;
  toolCalls: Array<AiToolCall & { durationMs?: number; cacheHit?: boolean; error?: string }>;
  sourceCount: number;
  usage: AiModelUsage | null;
  latencyMs: number;
  fallbackReason?: string;
  errorMessage?: string;
}) {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase.from("ai_runs").insert({
    id: args.id,
    organization_id: args.organizationId,
    branch_id: args.branchId,
    user_id: args.userId,
    session_id: args.sessionId,
    assistant_message_id: args.assistantMessageId,
    mode: args.mode,
    provider: args.provider,
    model: args.model,
    status: args.status,
    intent: args.intent,
    response_mode: args.responseMode,
    confidence_score: args.confidenceScore,
    telemetry: args.telemetry as unknown as Json,
    tool_calls: args.toolCalls as unknown as Json,
    source_count: args.sourceCount,
    prompt_tokens: args.usage?.promptTokens ?? 0,
    completion_tokens: args.usage?.completionTokens ?? 0,
    total_tokens: args.usage?.totalTokens ?? 0,
    estimated_cost_usd: args.usage?.estimatedCostUsd ?? null,
    latency_ms: args.latencyMs,
    fallback_reason: args.fallbackReason ?? null,
    error_message: args.errorMessage ?? null,
  });
  if (error) throw new Error(error.message);
}
