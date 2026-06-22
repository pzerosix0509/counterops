import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { OrderItem, KitchenStatus, OrderType } from "@/types/database";

export interface KitchenItem {
  item: OrderItem;
  tableName: string | null;
  orderType: OrderType;
  orderNumber: string;
  openedAt: string;
  paidAt: string | null;
}

export async function listKitchenItems(branchId: string, statuses: KitchenStatus[]): Promise<KitchenItem[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("order_items")
    .select("*, orders!inner(order_number, opened_at, closed_at, status, table_id, order_type, dining_tables(name))")
    .eq("branch_id", branchId)
    .in("kitchen_status", statuses)
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row: any) => row.orders?.status === "paid")
    .map((row: any) => ({
      item: {
        id: row.id,
        organization_id: row.organization_id,
        branch_id: row.branch_id,
        order_id: row.order_id,
        product_id: row.product_id,
        product_name_snapshot: row.product_name_snapshot,
        unit_price_snapshot: row.unit_price_snapshot,
        cost_price_snapshot: row.cost_price_snapshot,
        quantity: row.quantity,
        note: row.note,
        kitchen_status: row.kitchen_status,
        cancellation_stage: row.cancellation_stage,
        cancelled_by: row.cancelled_by,
        cancelled_at: row.cancelled_at,
        created_at: row.created_at,
      },
      tableName: row.orders?.dining_tables?.name ?? null,
      orderType: row.orders?.order_type ?? "takeaway",
      orderNumber: row.orders?.order_number ?? "-",
      openedAt: row.orders?.opened_at ?? row.created_at,
      paidAt: row.orders?.closed_at ?? null,
    }))
    .sort((a, b) => {
      const aTime = Date.parse(a.paidAt ?? a.openedAt ?? a.item.created_at);
      const bTime = Date.parse(b.paidAt ?? b.openedAt ?? b.item.created_at);
      return aTime - bTime;
    });
}
