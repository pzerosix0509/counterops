import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { PosProduct } from "@/lib/pos/product";
import { resolveProductStock } from "@/lib/pos/stock";
import type { OrderStatus, OrderType, Product, SalesChannel } from "@/types/database";

const POS_ACTIVE_ORDER_STATUSES: OrderStatus[] = ["draft", "open", "sent_to_kitchen", "partially_paid", "paid"];

export interface PosTableOrderSummary {
  orderId: string;
  tableId: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  itemCount: number;
  openedAt: string;
  orderType: OrderType;
  customerPhone: string | null;
  customerName: string | null;
}

export async function listActiveOrdersForPos(branchId: string): Promise<PosTableOrderSummary[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("orders")
    .select("id, table_id, order_number, status, total_amount, opened_at, order_type, customer:customers(phone, name), items:order_items(id), dining_tables!inner(status)")
    .eq("branch_id", branchId)
    .not("table_id", "is", null)
    .in("status", POS_ACTIVE_ORDER_STATUSES);
  if (error) throw new Error(error.message);
  const OPEN_STATUSES = new Set<OrderStatus>(["draft", "open", "sent_to_kitchen", "partially_paid"]);
  return (data ?? [])
    .filter((row) => {
      if (!row.table_id) return false;
      const table = Array.isArray(row.dining_tables) ? row.dining_tables[0] : row.dining_tables;
      const tableStatus = (table as { status?: string } | null)?.status;
      if (row.status === "paid") return tableStatus === "occupied";
      return OPEN_STATUSES.has(row.status as OrderStatus);
    })
    .map((row) => {
      const customer = Array.isArray(row.customer) ? row.customer[0] : row.customer;
      return {
        orderId: row.id,
        tableId: row.table_id as string,
        orderNumber: row.order_number,
        status: row.status as OrderStatus,
        totalAmount: row.total_amount,
        itemCount: (row.items ?? []).length,
        openedAt: row.opened_at,
        orderType: row.order_type as OrderType,
        customerPhone: (customer as { phone?: string } | null)?.phone ?? null,
        customerName: (customer as { name?: string } | null)?.name ?? null,
      };
    });
}

export async function listProductsForPos(organizationId: string, branchId: string): Promise<PosProduct[]> {
  const supabase = createSupabaseServerClient();
  const { data: products, error } = await supabase
    .from("products")
    .select("*")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .order("name");
  if (error) throw new Error(error.message);

  const preparedIds = (products ?? []).filter((p) => p.product_type === "prepared").map((p) => p.id);
  const [{ data: settings }, { data: balances }, { data: recipes }] = await Promise.all([
    supabase
      .from("product_branch_settings")
      .select("product_id, is_available, sale_price_override")
      .eq("branch_id", branchId),
    supabase
      .from("inventory_balances")
      .select("inventory_item_id, quantity_on_hand")
      .eq("branch_id", branchId),
    preparedIds.length > 0
      ? supabase
          .from("recipes")
          .select("product_id, recipe_items(inventory_item_id, quantity)")
          .eq("organization_id", organizationId)
          .eq("is_active", true)
          .in("product_id", preparedIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const branchMap = new Map<string, { is_available: boolean; sale_price_override: number | null }>();
  for (const s of settings ?? []) branchMap.set(s.product_id, { is_available: s.is_available, sale_price_override: s.sale_price_override });
  const stockMap = new Map<string, number>();
  for (const b of balances ?? []) stockMap.set(b.inventory_item_id, Number(b.quantity_on_hand ?? 0));

  const recipeByProduct = new Map<string, Array<{ inventory_item_id: string; quantity: number }>>();
  for (const recipe of recipes ?? []) {
    if (!recipeByProduct.has(recipe.product_id)) {
      recipeByProduct.set(
        recipe.product_id,
        (recipe.recipe_items ?? []).map((item: { inventory_item_id: string; quantity: number }) => ({
          inventory_item_id: item.inventory_item_id,
          quantity: Number(item.quantity),
        }))
      );
    }
  }

  return (products ?? []).map((p) => {
    const branch = branchMap.get(p.id);
    const branchAvailable = branch ? branch.is_available : true;
    const stock = resolveProductStock({
      isActive: p.is_active,
      branchAvailable,
      productType: p.product_type,
      inventoryItemId: p.inventory_item_id,
      stockMap,
      recipeItems: recipeByProduct.get(p.id) ?? [],
    });
    return {
      ...p,
      ...stock,
      sale_price: branch?.sale_price_override ?? p.sale_price,
    } as PosProduct;
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
    .select("*, items:order_items(*), payments(*), customer:customers(phone, name)")
    .eq("id", orderId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return order;
}

export type OrderWithItems = Awaited<ReturnType<typeof getOrderWithItems>>;
