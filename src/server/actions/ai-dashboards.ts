"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canViewReports, requireActiveContext, requireRole } from "@/lib/auth/permissions";
import { aiDashboardSpecSchema } from "@/lib/ai/schemas";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import type { AiDashboardSpec } from "@/types/ai";

const saveDashboardSchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(300).nullable().optional(),
  prompt: z.string().trim().min(1).max(1000),
  spec: aiDashboardSpecSchema,
});

export async function saveAiDashboardTemplate(
  organizationId: string,
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const membership = await requireRole(organizationId, canViewReports);
  const activeContext = await requireActiveContext();
  const parsed = saveDashboardSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Dashboard không hợp lệ.");
  if (
    activeContext.organizationId !== organizationId
    || (parsed.data.branchId && parsed.data.branchId !== activeContext.branchId)
  ) {
    return actionFail("FORBIDDEN", "Bạn không có quyền lưu dashboard cho chi nhánh này.");
  }

  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_dashboard_templates")
    .insert({
      organization_id: organizationId,
      branch_id: activeContext.branchId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      prompt: parsed.data.prompt,
      spec: parsed.data.spec as AiDashboardSpec,
      created_by: membership.membership.user_id,
    })
    .select("id")
    .single();
  if (error || !data) return actionFail("INTERNAL_ERROR", "Không lưu được dashboard: " + (error?.message ?? ""));

  revalidatePath("/ai");
  return actionOk({ id: data.id });
}
