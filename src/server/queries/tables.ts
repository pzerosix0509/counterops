import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Area, DiningTable } from "@/types/database";

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
