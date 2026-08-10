"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canViewReports, requireRole } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";

const sessionIdSchema = z.object({
  sessionId: z.string().uuid(),
}).strict();

const renameSchema = z.object({
  sessionId: z.string().uuid(),
  title: z.string().trim().min(1).max(160),
}).strict();

export async function renameAiChatSession(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ title: string }>> {
  const membership = await requireRole(organizationId, canViewReports);
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Tên hội thoại không hợp lệ.");

  const supabase = createSupabaseServerClient();
  const { data: session, error: sessionError } = await supabase
    .from("ai_chat_sessions")
    .select("id")
    .eq("id", parsed.data.sessionId)
    .eq("organization_id", organizationId)
    .eq("user_id", membership.membership.user_id)
    .maybeSingle();
  if (sessionError || !session) return actionFail("NOT_FOUND", "Không tìm thấy hội thoại.");

  const { error } = await supabase
    .from("ai_chat_sessions")
    .update({ title: parsed.data.title })
    .eq("id", session.id);
  if (error) return actionFail("INTERNAL_ERROR", `Không đổi được tên: ${error.message}`);

  revalidatePath("/ai");
  return actionOk({ title: parsed.data.title });
}

export async function togglePinAiChatSession(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ isPinned: boolean }>> {
  const membership = await requireRole(organizationId, canViewReports);
  const parsed = sessionIdSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Hội thoại không hợp lệ.");

  const supabase = createSupabaseServerClient();
  const { data: session, error: sessionError } = await supabase
    .from("ai_chat_sessions")
    .select("id, is_pinned")
    .eq("id", parsed.data.sessionId)
    .eq("organization_id", organizationId)
    .eq("user_id", membership.membership.user_id)
    .maybeSingle();
  if (sessionError || !session) return actionFail("NOT_FOUND", "Không tìm thấy hội thoại.");

  const next = !session.is_pinned;
  const { error } = await supabase
    .from("ai_chat_sessions")
    .update({ is_pinned: next })
    .eq("id", session.id);
  if (error) return actionFail("INTERNAL_ERROR", `Không ghim được hội thoại: ${error.message}`);

  revalidatePath("/ai");
  return actionOk({ isPinned: next });
}

export async function deleteAiChatSession(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ deleted: boolean }>> {
  const membership = await requireRole(organizationId, canViewReports);
  const parsed = sessionIdSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Hội thoại không hợp lệ.");

  const supabase = createSupabaseServerClient();
  const { data: session, error: sessionError } = await supabase
    .from("ai_chat_sessions")
    .select("id")
    .eq("id", parsed.data.sessionId)
    .eq("organization_id", organizationId)
    .eq("user_id", membership.membership.user_id)
    .maybeSingle();
  if (sessionError || !session) return actionFail("NOT_FOUND", "Không tìm thấy hội thoại.");

  // ai_chat_messages has on delete cascade; ai_runs.session_id is set null.
  const { error } = await supabase.from("ai_chat_sessions").delete().eq("id", session.id);
  if (error) return actionFail("INTERNAL_ERROR", `Không xóa được hội thoại: ${error.message}`);

  revalidatePath("/ai");
  return actionOk({ deleted: true });
}
