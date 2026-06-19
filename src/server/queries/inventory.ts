import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { InventoryItem, InventoryBalance, InventoryMovement } from "@/types/database";

export async function listInventoryItems(organizationId: string, search?: string): Promise<InventoryItem[]> {
  const supabase = createSupabaseServerClient();
  let q = supabase
    .from("inventory_items")
    .select("*")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name");
  if (search) q = q.ilike("name", `%${search}%`);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listInventoryBalances(organizationId: string, branchId: string): Promise<InventoryBalance[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_balances")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listInventoryMovements(branchId: string, itemId: string, limit = 50): Promise<InventoryMovement[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("inventory_movements")
    .select("*")
    .eq("branch_id", branchId)
    .eq("inventory_item_id", itemId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data ?? [];
}
