/**
 * Store Config: Manage Grab mock store configuration
 * 
 * Handles CRUD operations on grab_store_config table.
 */

import "server-only";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { GrabStoreConfig } from "@/types/database";

export interface StoreConfigResult {
  success: boolean;
  message: string;
  config?: GrabStoreConfig;
}

/**
 * Get or create grab_store_config for a branch
 */
export async function getOrCreateGrabStoreConfig(
  organizationId: string,
  branchId: string
): Promise<GrabStoreConfig | null> {
  const admin = createSupabaseAdminClient();

  const { data: config, error } = await admin
    .from("grab_store_config")
    .select("*")
    .eq("branch_id", branchId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (config) {
    return config;
  }

  if (error && error.code !== "PGRST116") {
    console.error(`[GRAB CONFIG] Error fetching config:`, error);
    return null;
  }

  // Create default config for this branch
  console.log(`[GRAB CONFIG] Creating default config for branch ${branchId}`);
  const { data: newConfig, error: createError } = await admin
    .from("grab_store_config")
    .insert({
      organization_id: organizationId,
      branch_id: branchId,
      is_online: false,
      merchant_id: `MOCK-${branchId.substring(0, 8)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle();

  if (createError) {
    console.error(`[GRAB CONFIG] Error creating config:`, createError);
    return null;
  }

  return newConfig;
}

/**
 * Set store online status
 */
export async function setGrabStoreOnlineStatus(
  organizationId: string,
  branchId: string,
  isOnline: boolean
): Promise<StoreConfigResult> {
  console.log(`[GRAB CONFIG] Setting store online status: ${isOnline}`);

  const admin = createSupabaseAdminClient();

  // Ensure config exists
  await getOrCreateGrabStoreConfig(organizationId, branchId);

  const { data: updated, error } = await admin
    .from("grab_store_config")
    .update({
      is_online: isOnline,
      updated_at: new Date().toISOString(),
    })
    .eq("branch_id", branchId)
    .eq("organization_id", organizationId)
    .select()
    .maybeSingle();

  if (error || !updated) {
    console.error(`[GRAB CONFIG] Error updating status:`, error);
    return {
      success: false,
      message: "Không cập nhật được trạng thái",
    };
  }

  const statusText = isOnline ? "bật" : "tắt";
  console.log(`[GRAB CONFIG] Store ${statusText} successfully`);

  return {
    success: true,
    message: `Cửa hàng Grab ${statusText} thành công`,
    config: updated,
  };
}

/**
 * Get current store configuration
 */
export async function getGrabStoreConfig(
  organizationId: string,
  branchId: string
): Promise<GrabStoreConfig | null> {
  const admin = createSupabaseAdminClient();

  const { data: config, error } = await admin
    .from("grab_store_config")
    .select("*")
    .eq("branch_id", branchId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error(`[GRAB CONFIG] Error fetching config:`, error);
    return null;
  }

  return config;
}
