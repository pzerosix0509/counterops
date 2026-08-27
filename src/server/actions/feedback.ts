"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canRefreshAnalytics, canViewReports, requireActiveContext, requireRole } from "@/lib/auth/permissions";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { clearAiToolCache } from "@/server/ai/cache";
import { scoreFeedbackText, SENTIMENT_CONCURRENCY } from "@/server/ai/sentiment";
import { refreshAndScoreCustomerFeatures } from "@/server/queries/analytics-features";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { upsertCustomerByPhone } from "@/server/customers";

const createFeedbackSchema = z.object({
  orderId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  customerPhone: z.string().trim().max(20).optional().nullable(),
  customerName: z.string().trim().max(120).optional().nullable(),
  rating: z.number().int().min(1).max(5),
  feedbackText: z.string().trim().max(4000).optional().nullable(),
}).strict();

export async function createCustomerFeedback(input: {
  orderId?: string | null;
  customerId?: string | null;
  customerPhone?: string | null;
  customerName?: string | null;
  rating: number;
  feedbackText?: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireActiveContext();
  await requireRole(ctx.organizationId, canViewReports);
  const parsed = createFeedbackSchema.safeParse({
    orderId: input.orderId || null,
    customerId: input.customerId || null,
    customerPhone: input.customerPhone?.trim() || null,
    customerName: input.customerName?.trim() || null,
    rating: input.rating,
    feedbackText: input.feedbackText?.trim() || null,
  });
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Phản hồi không hợp lệ.");

  const supabase = createSupabaseServerClient();
  let customerId = parsed.data.customerId ?? null;
  if (!customerId && parsed.data.customerPhone) {
    try {
      customerId = await upsertCustomerByPhone(
        supabase,
        ctx.organizationId,
        parsed.data.customerPhone,
        parsed.data.customerName,
      );
    } catch (error) {
      return actionFail("INTERNAL_ERROR", error instanceof Error ? error.message : "Không lưu được khách");
    }
  }
  const { data, error } = await supabase
    .from("customer_feedback")
    .insert({
      organization_id: ctx.organizationId,
      branch_id: ctx.branchId,
      order_id: parsed.data.orderId ?? null,
      customer_id: customerId,
      rating: parsed.data.rating,
      feedback_text: parsed.data.feedbackText ?? null,
      sentiment_label: null,
      sentiment_score: null,
      model_name: null,
      scored_at: null,
    })
    .select("id")
    .single();
  if (error || !data) {
    return actionFail("INTERNAL_ERROR", "Không lưu được phản hồi" + (error ? `: ${error.message}` : "."));
  }

  revalidatePath("/analytics");
  return actionOk({ id: data.id });
}

export async function scoreUnscoredFeedback(): Promise<number> {
  const ctx = await requireActiveContext();
  await requireRole(ctx.organizationId, canRefreshAnalytics);
  const supabase = createSupabaseServerClient();
  const { data: rows, error } = await supabase
    .from("customer_feedback")
    .select("id, feedback_text")
    .eq("organization_id", ctx.organizationId)
    .eq("branch_id", ctx.branchId)
    .not("feedback_text", "is", null)
    .is("scored_at", null)
    .limit(60);
  if (error) throw new Error(error.message);
  const pending = (rows ?? []).filter((row) => row.feedback_text?.trim());
  let scored = 0;
  for (let i = 0; i < pending.length; i += SENTIMENT_CONCURRENCY) {
    const batch = pending.slice(i, i + SENTIMENT_CONCURRENCY);
    const results = await Promise.all(batch.map((row) => scoreFeedbackText(row.feedback_text ?? "")));
    await Promise.all(batch.map(async (row, index) => {
      const result = results[index];
      if (!result) return;
      const { error: updateError } = await supabase
        .from("customer_feedback")
        .update({
          sentiment_label: result.label,
          sentiment_score: result.score,
          model_name: result.modelName,
          scored_at: new Date().toISOString(),
        })
        .eq("id", row.id)
        .eq("organization_id", ctx.organizationId)
        .eq("branch_id", ctx.branchId);
      if (updateError) throw new Error(updateError.message);
      scored += 1;
    }));
  }

  await refreshAndScoreCustomerFeatures(ctx.organizationId, ctx.branchId);
  clearAiToolCache();
  revalidatePath("/analytics");
  return scored;
}
