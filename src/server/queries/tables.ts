import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Area, DiningTable, Order, OrderItem } from "@/types/database";

export async function listAreas(branchId: string): Promise<Area[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("areas").select("*").eq("branch_id", branchId).order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listTables(branchId: string): Promise<DiningTable[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase.from("dining_tables").select("*").eq("branch_id", branchId).order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type OpenOrderWithItems = Order & { items: OrderItem[] };

export async function listOpenOrdersByTable(branchId: string): Promise<Record<string, OpenOrderWithItems>> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*, items:order_items(*), dining_tables(status)")
    .eq("branch_id", branchId)
    .neq("status", "cancelled")
    .neq("status", "refunded")
    .order("opened_at", { ascending: false });
  if (error) throw new Error(error.message);
  const map: Record<string, OpenOrderWithItems> = {};
  for (const o of data ?? []) {
    if (o.status === "paid" && (o as any).dining_tables?.status !== "occupied") continue;
    if (o.table_id && !map[o.table_id]) map[o.table_id] = o;
  }
  return map;
}
