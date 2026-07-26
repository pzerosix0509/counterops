"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { canManageInventory, requireRole } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { inventorySettingsSchema, operationalSettingsSchema } from "@/lib/validation/schemas";
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

export async function updateOperationalSettings(
  organizationId: string,
  input: unknown
): Promise<ActionResult<{ saved: true }>> {
  const membership = await requireRole(organizationId, ["owner", "admin", "manager"]);
  const parsed = operationalSettingsSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      if (!fieldErrors[key]) fieldErrors[key] = [];
      fieldErrors[key].push(issue.message);
    }
    return actionFail("VALIDATION_ERROR", "Thiết lập không hợp lệ", fieldErrors);
  }

  const data = parsed.data;
  const admin = createSupabaseAdminClient();

  const { error: orgError } = await admin
    .from("organizations")
    .update({ allow_negative_inventory: data.allowNegativeInventory })
    .eq("id", membership.organization.id);
  if (orgError) return actionFail("INTERNAL_ERROR", "Không lưu được thiết lập cửa hàng: " + orgError.message);

  const settingsPayload = {
    organization_id: membership.organization.id,
    inventory_deduction_timing: data.inventoryDeductionTiming,
    low_stock_alert_enabled: data.lowStockAlertEnabled,
    default_low_stock_threshold: data.defaultLowStockThreshold,
    default_order_type: data.defaultOrderType,
    default_takeaway_channel_id: data.defaultTakeawayChannelId || null,
    allow_unpaid_orders: data.allowUnpaidOrders,
    discounts_enabled: data.discountsEnabled,
    max_discount_percent: data.maxDiscountPercent,
    default_payment_method: data.defaultPaymentMethod,
    kitchen_sound_enabled: data.kitchenSoundEnabled,
    auto_send_to_kitchen_on_payment: data.autoSendToKitchenOnPayment,
    show_regular_items_in_kitchen: data.showRegularItemsInKitchen,
    auto_mark_served_on_ready: data.autoMarkServedOnReady,
    business_day_start_time: data.businessDayStartTime,
    include_service_fee_in_revenue: data.includeServiceFeeInRevenue,
    auto_generate_eod: data.autoGenerateEod,
    receipt_store_name: data.receiptStoreName || null,
    receipt_address: data.receiptAddress || null,
    receipt_phone: data.receiptPhone || null,
    receipt_logo_url: data.receiptLogoUrl || null,
    receipt_footer: data.receiptFooter || "Cảm ơn quý khách.",
    bank_code: data.bankCode || null,
    bank_account_number: data.bankAccountNumber || null,
    updated_at: new Date().toISOString(),
  };
  const { error: settingsError } = await admin
    .from("organization_settings")
    .upsert(settingsPayload, { onConflict: "organization_id" });
  if (settingsError) return actionFail("INTERNAL_ERROR", "Không lưu được thiết lập vận hành: " + settingsError.message);

  for (let index = 0; index < data.salesChannels.length; index += 1) {
    const channel = data.salesChannels[index];
    const payload = {
      organization_id: membership.organization.id,
      name: channel.name,
      type: channel.type,
      is_active: channel.isActive,
      platform_fee_percent: channel.platformFeePercent,
      sort_order: channel.sortOrder || index,
    };
    const result = channel.id
      ? await admin.from("sales_channels").update(payload).eq("id", channel.id).eq("organization_id", membership.organization.id)
      : await admin.from("sales_channels").insert(payload);
    if (result.error) return actionFail("INTERNAL_ERROR", "Không lưu được kênh bán: " + result.error.message);
  }

  await admin.from("audit_logs").insert({
    organization_id: membership.organization.id,
    actor_user_id: membership.membership.user_id,
    action: "settings.operational.update",
    entity_type: "organization_settings",
    entity_id: membership.organization.id,
    after: settingsPayload,
  });

  revalidatePath("/settings");
  revalidatePath("/pos");
  revalidatePath("/kitchen");
  revalidatePath("/dashboard");
  revalidatePath("/reports/end-of-day");
  revalidateTag(`settings-${membership.organization.id}`);
  return actionOk({ saved: true });
}
