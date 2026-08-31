import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  KITCHEN_TRACKED_STATUSES,
  mergeKitchenCompanionRows,
  transformKitchenItems,
  type KitchenBoardItem,
  type KitchenBoardRow,
} from "@/lib/calculations/kitchen";
import type { KitchenStatus } from "@/types/database";

export type { KitchenItem } from "@/lib/calculations/kitchen";
export type { KitchenBoardItem };

const KITCHEN_SELECT =
  "*, orders!inner(order_number, opened_at, closed_at, status, table_id, order_type, dining_tables(name))";

export async function listKitchenItems(
  branchId: string,
  statuses: KitchenStatus[],
  opts: { includeRegular?: boolean } = {}
): Promise<KitchenBoardItem[]> {
  const supabase = createSupabaseServerClient();
  const trackedStatuses = statuses.filter((status) => status !== "not_required");
  const statusList = opts.includeRegular
    ? Array.from(new Set([...statuses, "not_required" as KitchenStatus]))
    : trackedStatuses.length > 0
      ? trackedStatuses
      : [...KITCHEN_TRACKED_STATUSES];

  const { data: tracked, error } = await supabase
    .from("order_items")
    .select(KITCHEN_SELECT)
    .eq("branch_id", branchId)
    .in("kitchen_status", statusList)
    .order("created_at");
  if (error) throw new Error(error.message);

  let rows = (tracked ?? []) as KitchenBoardRow[];
  if (!opts.includeRegular && rows.length > 0) {
    const orderIds = Array.from(new Set(rows.map((row) => row.order_id)));
    const { data: companions, error: companionErr } = await supabase
      .from("order_items")
      .select(KITCHEN_SELECT)
      .eq("branch_id", branchId)
      .in("order_id", orderIds)
      .eq("kitchen_status", "not_required")
      .order("created_at");
    if (companionErr) throw new Error(companionErr.message);
    rows = mergeKitchenCompanionRows([...rows, ...((companions ?? []) as KitchenBoardRow[])]);
  }

  return transformKitchenItems(rows);
}
