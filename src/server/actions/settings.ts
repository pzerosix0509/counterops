"use server";

import { revalidatePath } from "next/cache";
import { canManageInventory, requireRole } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { inventorySettingsSchema } from "@/lib/validation/schemas";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";

export async function updateInventorySettings(
  organizationId: string,
  input: unknown
): Promise<ActionResult<{ allowNegativeInventory: boolean }>> {
  const membership = await requireRole(organizationId, canManageInventory);
  const parsed = inventorySettingsSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Thiết lập kho không hợp lệ");

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("organizations")
    .update({ allow_negative_inventory: parsed.data.allowNegativeInventory })
    .eq("id", membership.organization.id);

  if (error) return actionFail("INTERNAL_ERROR", "Không lưu được thiết lập kho: " + error.message);

  await admin.from("audit_logs").insert({
    organization_id: membership.organization.id,
    actor_user_id: membership.membership.user_id,
    action: "settings.inventory.update",
    entity_type: "organizations",
    entity_id: membership.organization.id,
    after: { allow_negative_inventory: parsed.data.allowNegativeInventory },
  });

  revalidatePath("/settings");
  revalidatePath("/inventory");
  return actionOk({ allowNegativeInventory: parsed.data.allowNegativeInventory });
}
