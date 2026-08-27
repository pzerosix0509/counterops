// Kitchen board transformation helpers.

import type { KitchenStatus, OrderType } from "@/types/database";

export interface KitchenBoardRow {
  id: string;
  organization_id: string;
  branch_id: string;
  order_id: string;
  product_id: string;
  product_name_snapshot: string;
  unit_price_snapshot: number;
  cost_price_snapshot: number;
  quantity: number;
  note: string | null;
  kitchen_status: KitchenStatus;
  cancellation_stage: string | null;
  cancelled_by: string | null;
  cancelled_at: string | null;
  created_at: string;
  orders?: {
    order_number: string;
    opened_at: string;
    closed_at: string | null;
    status: string;
    order_type: OrderType;
    dining_tables?: { name: string | null } | null;
  } | null;
}

export interface KitchenBoardItem {
  item: Omit<KitchenBoardRow, "orders">;
  tableName: string | null;
  orderType: OrderType;
  orderNumber: string;
  openedAt: string;
  paidAt: string | null;
}

export type KitchenItem = KitchenBoardItem;

export function transformKitchenItems(rows: KitchenBoardRow[]): KitchenBoardItem[] {
  return (rows ?? [])
    .filter((row) => row.orders?.status === "paid")
    .map((row) => ({
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
