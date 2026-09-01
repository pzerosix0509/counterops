/**
 * Menu Sync: Sync menu items and availability to Grab mock
 * 
 * CURRENT STATUS: Stub implementation for capstone demo
 * 
 * This module synchronizes menu item availability and pricing from CounterOps
 * to the mock Grab system. Currently minimal implementation.
 * 
 * TODO: In future expansion, hook into:
 * - src/server/actions/menu.ts (product price/availability changes)
 * - src/server/actions/inventory.ts (stock level changes)
 * And sync those changes to grab_sync_events + mock Grab API.
 */

import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { logGrabSyncEvent } from "./webhook-handler";

export interface MenuSyncResult {
  success: boolean;
  message: string;
  itemsSynced?: number;
}

/**
 * Sync current menu state to Grab mock
 * 
 * This is a stub that:
 * 1. Fetches active products for the branch
 * 2. Logs a menu_synced event with basic payload
 * 3. Updates last_menu_sync_at timestamp
 * 
 * Future expansion should:
 * - Compare current menu with previous sync
 * - Identify changed items (price, availability, removed)
 * - Call mock Grab API to push changes
 * - Handle partial sync failures with retry logic
 */
export async function syncGrabMenu(
  organizationId: string,
  branchId: string
): Promise<MenuSyncResult> {
  console.log(`[GRAB MENU_SYNC] Syncing menu for org=${organizationId}, branch=${branchId}`);

  const admin = createSupabaseAdminClient();

  try {
    // Fetch active products
    const { data: products, error: fetchError } = await admin
      .from("products")
      .select("id, name, sale_price, is_active")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name");

    if (fetchError) {
      console.error(`[GRAB MENU_SYNC] Failed to fetch products:`, fetchError);
      await logGrabSyncEvent(admin, organizationId, branchId, null, "error", {
        reason: "Failed to fetch products for sync",
        error: fetchError.message,
      });
      return {
        success: false,
        message: "Không thể tải menu",
      };
    }

    const itemCount = products?.length ?? 0;
    console.log(`[GRAB MENU_SYNC] Found ${itemCount} active items`);

    // Log the menu sync event (stub: just record that sync happened)
    await logGrabSyncEvent(admin, organizationId, branchId, null, "menu_synced", {
      item_count: itemCount,
      items_sample: (products ?? []).slice(0, 5).map((p) => ({
        id: p.id,
        name: p.name,
        price: p.sale_price,
      })),
      note: "Stub implementation - see menu-sync.ts for expansion notes",
    });

    // Update last_menu_sync_at
    const { error: updateError } = await admin
      .from("grab_store_config")
      .update({ last_menu_sync_at: new Date().toISOString() })
      .eq("branch_id", branchId);

    if (updateError) {
      console.warn(`[GRAB MENU_SYNC] Failed to update sync timestamp:`, updateError);
    }

    return {
      success: true,
      message: `Đã đồng bộ ${itemCount} mục menu`,
      itemsSynced: itemCount,
    };
  } catch (error) {
    console.error(`[GRAB MENU_SYNC] Unexpected error:`, error);
    await logGrabSyncEvent(admin, organizationId, branchId, null, "error", {
      reason: "Unexpected error during menu sync",
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      message: "Lỗi đồng bộ menu",
    };
  }
}
