"use server";

import { revalidatePath } from "next/cache";
import { canRefreshAnalytics, requireActiveContext, requireRole } from "@/lib/auth/permissions";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { clearAiToolCache } from "@/server/ai/cache";
import { scoreUnscoredFeedback } from "@/server/actions/feedback";
import { refreshAndScoreCustomerFeatures } from "@/server/queries/analytics-features";

export async function refreshCustomerAnalytics(): Promise<ActionResult<{ updated: number }>> {
  const ctx = await requireActiveContext();
  await requireRole(ctx.organizationId, canRefreshAnalytics);
  try {
    await scoreUnscoredFeedback();
    const updated = await refreshAndScoreCustomerFeatures(ctx.organizationId, ctx.branchId);
    clearAiToolCache();
    revalidatePath("/analytics");
    return actionOk({ updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return actionFail("INTERNAL_ERROR", "Không làm mới được RFM: " + message);
  }
}
