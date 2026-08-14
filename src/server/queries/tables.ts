import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Area, DiningTable, Order, OrderItem } from "@/types/database";

export async function listAreas(branchId: string): Promise<Area[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("areas")
    .select("id, organization_id, branch_id, name, sort_order")
    .eq("branch_id", branchId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listTables(branchId: string): Promise<DiningTable[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("dining_tables")
    .select("id, organization_id, branch_id, area_id, room_id, name, seats, status, sort_order")
    .eq("branch_id", branchId)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export type OpenOrderWithItems = Order & {
  items: OrderItem[];
  customer?: { name: string | null; phone: string | null } | null;
};

export async function listOpenOrdersByTable(branchId: string): Promise<Record<string, OpenOrderWithItems>> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*, items:order_items(*), customer:customers(name, phone)")
    .eq("branch_id", branchId)
    .in("status", ["draft", "open", "sent_to_kitchen", "partially_paid"])
    .order("opened_at", { ascending: false });
  if (error) throw new Error(error.message);
  const map: Record<string, OpenOrderWithItems> = {};
  for (const o of data ?? []) {
    const row = o as OpenOrderWithItems & { customer?: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null };
    const linked = Array.isArray(row.customer) ? row.customer[0] : row.customer;
    if (o.table_id && !map[o.table_id]) {
      map[o.table_id] = { ...row, customer: linked ?? null };
    }
  }
  return map;
}
