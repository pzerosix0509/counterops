import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Area, DiningTable, Order } from "@/types/database";

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

export async function listOpenOrdersByTable(branchId: string): Promise<Record<string, Order>> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("branch_id", branchId)
    .neq("status", "paid")
    .neq("status", "cancelled")
    .neq("status", "refunded");
  if (error) throw new Error(error.message);
  const map: Record<string, Order> = {};
  for (const o of data ?? []) {
    if (o.table_id && !map[o.table_id]) map[o.table_id] = o;
  }
  return map;
}
