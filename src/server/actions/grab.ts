/**
 * Server Actions for Grab integration
 * 
 * Public actions that can be called from React components.
 * Follow standard pattern: permission check → validation → business logic → result.
 */

"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/permissions";
import { toggleGrabOnlineSchema, syncGrabMenuSchema } from "@/lib/validation/grab-schemas";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { setGrabStoreOnlineStatus } from "@/server/integrations/grab/store-config";
import { syncGrabMenu } from "@/server/integrations/grab/menu-sync";
import { getActiveBranchId } from "@/lib/auth/permissions";

/**
 * Toggle Grab store online/offline status
 * Requires manager+ role
 */
export async function toggleGrabOnlineStatus(
  organizationId: string,
  input: unknown
): Promise<ActionResult<{ isOnline: boolean }>> {
  // Permission check
  const membership = await requireRole(organizationId, ["owner", "admin", "manager"]);

  // Get active branch
  const branchId = await getActiveBranchId(organizationId);
  if (!branchId) {
    return actionFail("NO_BRANCH", "Không có chi nhánh hoạt động");
  }

  // Validation
  const parsed = toggleGrabOnlineSchema.safeParse(input);
  if (!parsed.success) {
    return actionFail("VALIDATION_ERROR", "Dữ liệu không hợp lệ");
  }

  // Business logic
  const result = await setGrabStoreOnlineStatus(organizationId, branchId, parsed.data.isOnline);

  if (!result.success) {
    return actionFail("UPDATE_FAILED", result.message);
  }

  // Revalidate UI
  revalidatePath("/integrations");

  return actionOk({ isOnline: parsed.data.isOnline });
}

/**
 * Manually sync Grab menu
 * Requires manager+ role
 */
export async function manualSyncGrabMenu(
  organizationId: string,
  input: unknown
): Promise<ActionResult<{ itemsSynced: number }>> {
  // Permission check
  const membership = await requireRole(organizationId, ["owner", "admin", "manager"]);

  // Get active branch
  const branchId = await getActiveBranchId(organizationId);
  if (!branchId) {
    return actionFail("NO_BRANCH", "Không có chi nhánh hoạt động");
  }

  // Validation
  const parsed = syncGrabMenuSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return actionFail("VALIDATION_ERROR", "Dữ liệu không hợp lệ");
  }

  // Business logic
  const result = await syncGrabMenu(organizationId, branchId);

  if (!result.success) {
    return actionFail("SYNC_FAILED", result.message);
  }

  // Revalidate UI
  revalidatePath("/integrations");

  return actionOk({ itemsSynced: result.itemsSynced ?? 0 });
}
