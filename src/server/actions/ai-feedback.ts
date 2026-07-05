"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canViewReports, requireRole } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";

const feedbackSchema = z.object({
  messageId: z.string().uuid(),
  rating: z.union([z.literal(-1), z.literal(1)]),
  comment: z.string().trim().max(1000).nullable().optional(),
}).strict();

export async function submitAiMessageFeedback(
  organizationId: string,
  input: unknown,
): Promise<ActionResult<{ rating: -1 | 1 }>> {
  const membership = await requireRole(organizationId, canViewReports);
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Đánh giá không hợp lệ.");

  const supabase = createSupabaseServerClient();
  const { data: message, error: messageError } = await supabase
    .from("ai_chat_messages")
    .select("id, organization_id, branch_id, session_id")
    .eq("id", parsed.data.messageId)
    .eq("organization_id", organizationId)
    .eq("role", "assistant")
    .maybeSingle();
  if (messageError || !message) return actionFail("NOT_FOUND", "Không tìm thấy câu trả lời AI.");

  const { error } = await supabase.from("ai_message_feedback").upsert({
    organization_id: organizationId,
    branch_id: message.branch_id,
    message_id: message.id,
    user_id: membership.membership.user_id,
    rating: parsed.data.rating,
    comment: parsed.data.comment ?? null,
  }, { onConflict: "message_id,user_id" });
  if (error) return actionFail("INTERNAL_ERROR", `Không lưu được đánh giá: ${error.message}`);

  revalidatePath("/ai");
  return actionOk({ rating: parsed.data.rating });
}
