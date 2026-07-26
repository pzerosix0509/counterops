import "server-only";
import { unstable_cache } from "next/cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_OPERATIONAL_SETTINGS,
  type OperationalSettings,
} from "@/lib/settings/operational";
import type { OrganizationSettings } from "@/types/database";

function mapSettings(row: OrganizationSettings | null | undefined): OperationalSettings {
  if (!row) return DEFAULT_OPERATIONAL_SETTINGS;
  return {
    inventoryDeductionTiming: row.inventory_deduction_timing,
    lowStockAlertEnabled: row.low_stock_alert_enabled,
    defaultLowStockThreshold: Number(row.default_low_stock_threshold ?? 0),
    defaultOrderType: row.default_order_type,
    defaultTakeawayChannelId: row.default_takeaway_channel_id,
    allowUnpaidOrders: row.allow_unpaid_orders,
    discountsEnabled: row.discounts_enabled,
    maxDiscountPercent: Number(row.max_discount_percent ?? 100),
    defaultPaymentMethod: row.default_payment_method,
    kitchenSoundEnabled: row.kitchen_sound_enabled,
    autoSendToKitchenOnPayment: row.auto_send_to_kitchen_on_payment,
    showRegularItemsInKitchen: row.show_regular_items_in_kitchen,
    autoMarkServedOnReady: row.auto_mark_served_on_ready,
    businessDayStartTime: row.business_day_start_time.slice(0, 5),
    includeServiceFeeInRevenue: row.include_service_fee_in_revenue,
    autoGenerateEod: row.auto_generate_eod,
    receiptStoreName: row.receipt_store_name,
    receiptAddress: row.receipt_address,
    receiptPhone: row.receipt_phone,
    receiptLogoUrl: row.receipt_logo_url,
    receiptFooter: row.receipt_footer,
    bankCode: row.bank_code ?? null,
    bankAccountNumber: row.bank_account_number ?? null,
  };
}

async function fetchOperationalSettings(organizationId: string): Promise<OperationalSettings> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("organization_settings")
    .select("*")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return mapSettings(data as OrganizationSettings | null);
}

export function getOperationalSettings(organizationId: string): Promise<OperationalSettings> {
  return unstable_cache(
    () => fetchOperationalSettings(organizationId),
    ["settings", organizationId],
    { revalidate: 60, tags: [`settings-${organizationId}`] }
  )();
}
