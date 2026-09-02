import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { transformKitchenItems, type KitchenBoardItem, type KitchenBoardRow } from "@/lib/calculations/kitchen";
import type { KitchenStatus } from "@/types/database";

export type { KitchenItem } from "@/lib/calculations/kitchen";
export type { KitchenBoardItem };

export async function listKitchenItems(
  branchId: string,
  statuses: KitchenStatus[],
  opts: { includeRegular?: boolean } = {}
): Promise<KitchenBoardItem[]> {
  const supabase = createSupabaseServerClient();
  const statusList = opts.includeRegular ? Array.from(new Set([...statuses, "not_required" as KitchenStatus])) : statuses;
  const { data, error } = await supabase
    .from("order_items")
    .select("*, orders!inner(order_number, opened_at, closed_at, status, table_id, order_type, dining_tables(name), sales_channels(name))")
    .eq("branch_id", branchId)
    .in("kitchen_status", statusList)
    .order("created_at");
  if (error) throw new Error(error.message);
  return transformKitchenItems((data ?? []) as KitchenBoardRow[]);
}
