import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Product, SalesChannel } from "@/types/database";

export async function listProductsForPos(organizationId: string, branchId: string): Promise<(Product & { available: boolean })[]> {
  const supabase = createSupabaseServerClient();
  const [{ data, error }, { data: settings }] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("is_active", true)
      .order("name"),
    supabase
      .from("product_branch_settings")
      .select("product_id, is_available, sale_price_override")
      .eq("branch_id", branchId),
  ]);
  if (error) throw new Error(error.message);
  const map = new Map<string, { is_available: boolean; sale_price_override: number | null }>();
  for (const s of settings ?? []) map.set(s.product_id, { is_available: s.is_available, sale_price_override: s.sale_price_override });
  return (data ?? []).map((p) => {
    const s = map.get(p.id);
    return {
      ...p,
      available: s ? s.is_available : true,
      sale_price: s?.sale_price_override ?? p.sale_price,
    } as Product & { available: boolean };
  });
}

export async function listSalesChannels(organizationId: string, opts: { includeInactive?: boolean } = {}): Promise<SalesChannel[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("sales_channels")
    .select("id, organization_id, name, type, is_active, platform_fee_percent, sort_order")
    .eq("organization_id", organizationId);
  if (!opts.includeInactive) query = query.eq("is_active", true);
  const { data, error } = await query
    .order("sort_order", { ascending: true })
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function getOrderWithItems(organizationId: string, orderId: string) {
  const supabase = createSupabaseServerClient();
  const { data: order, error } = await supabase
    .from("orders")
    .select("*, items:order_items(*), payments(*)")
    .eq("id", orderId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return order;
}

export type OrderWithItems = Awaited<ReturnType<typeof getOrderWithItems>>;
