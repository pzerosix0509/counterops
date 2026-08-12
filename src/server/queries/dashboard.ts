import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DateRange } from "@/lib/date/ranges";
import { calculateProfitTotals } from "@/lib/calculations/orders";
import {
  buildRevenueTrend,
  buildMenuBreakdown,
  buildChannelBreakdown,
  buildTopProducts,
  computeDashboardCore,
  type DashboardOrderRow,
  type DashboardItemRow,
  type CancelledItemRow,
  type ProductMeta,
} from "@/lib/calculations/dashboard";

export interface DashboardSummary {
  revenueToday: number;
  ordersToday: number;
  occupiedTables: number;
  totalTables: number;
  selectedNetRevenue: number;
  selectedCostOfGoods: number;
  selectedGrossProfit: number;
  selectedGrossMarginPercent: number;
  selectedChannelFees: number;
  selectedNetProfit: number;
  selectedOrders: number;
  paidOrders: number;
  averageItemValue: number;
  foodAverage: number;
  drinkAverage: number;
  cancelledItems: number;
  cancelledOrders: number;
  cancelledAfterKitchen: number;
  cancelledAfterTempBill: number;
  cancelledOutOfStock: number;
  revenueTrend: { bucket: string; revenue: number; orders: number }[];
  menuBreakdown: { categoryId: string | null; categoryName: string; revenue: number; orders: number }[];
  channelBreakdown: { channelId: string | null; channelName: string; revenue: number; orders: number }[];
  topProducts: { productId: string | null; name: string; quantity: number; revenue: number; costOfGoods: number; grossProfit: number }[];
}

const EMPTY: DashboardSummary = {
  revenueToday: 0,
  ordersToday: 0,
  occupiedTables: 0,
  totalTables: 0,
  selectedNetRevenue: 0,
  selectedCostOfGoods: 0,
  selectedGrossProfit: 0,
  selectedGrossMarginPercent: 0,
  selectedChannelFees: 0,
  selectedNetProfit: 0,
  selectedOrders: 0,
  paidOrders: 0,
  averageItemValue: 0,
  foodAverage: 0,
  drinkAverage: 0,
  cancelledItems: 0,
  cancelledOrders: 0,
  cancelledAfterKitchen: 0,
  cancelledAfterTempBill: 0,
  cancelledOutOfStock: 0,
  revenueTrend: [],
  menuBreakdown: [],
  channelBreakdown: [],
  topProducts: [],
};

export async function getDashboardSummary(opts: {
  organizationId: string;
  branchId: string;
  range: DateRange;
  granularity: "hour" | "day";
}): Promise<DashboardSummary> {
  const { organizationId, branchId, range, granularity } = opts;
  const supabase = createSupabaseServerClient();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const [
    { data: todayPaid },
    { count: todayCount },
    { count: tableCount },
    { count: occupied },
    { data: rangeOrdersRaw },
    { data: rangeItems },
    { data: cancelledItemsRaw },
    { data: cancelledOrders },
  ] = await Promise.all([
    supabase
      .from("orders")
      .select("total_amount")
      .eq("branch_id", branchId)
      .eq("status", "paid")
      .gte("opened_at", todayStart.toISOString())
      .lte("opened_at", todayEnd.toISOString()),
    supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("branch_id", branchId)
      .gte("opened_at", todayStart.toISOString())
      .lte("opened_at", todayEnd.toISOString()),
    supabase
      .from("dining_tables")
      .select("id", { count: "exact", head: true })
      .eq("branch_id", branchId)
      .neq("status", "disabled"),
    supabase
      .from("dining_tables")
      .select("id", { count: "exact", head: true })
      .eq("branch_id", branchId)
      .eq("status", "occupied"),
    supabase
      .from("orders")
      .select("id, status, total_amount, paid_amount, opened_at, sales_channel_id, order_type, order_number")
      .eq("branch_id", branchId)
      .gte("opened_at", range.from.toISOString())
      .lte("opened_at", range.to.toISOString()),
    supabase
      .from("order_items")
      .select("id, product_id, product_name_snapshot, unit_price_snapshot, cost_price_snapshot, quantity, kitchen_status, order_id, orders!inner(branch_id, opened_at, status, sales_channel_id)")
      .eq("branch_id", branchId)
      .gte("orders.opened_at", range.from.toISOString())
      .lte("orders.opened_at", range.to.toISOString()),
    supabase
      .from("order_items")
      .select("id, cancellation_stage, order_id, orders!inner(branch_id, status, opened_at)")
      .eq("branch_id", branchId)
      .eq("kitchen_status", "cancelled")
      .gte("orders.opened_at", range.from.toISOString())
      .lte("orders.opened_at", range.to.toISOString()),
    supabase
      .from("orders")
      .select("id, status, opened_at, cancellation_reason")
      .eq("branch_id", branchId)
      .eq("status", "cancelled")
      .gte("opened_at", range.from.toISOString())
      .lte("opened_at", range.to.toISOString()),
  ]);

  const rangeOrders = (rangeOrdersRaw ?? []) as unknown as DashboardOrderRow[];
  const cancelledItems = (cancelledItemsRaw ?? []) as unknown as CancelledItemRow[];
  const allItems = ((rangeItems ?? []).filter((it: any) => it.orders?.status === "paid") as unknown) as DashboardItemRow[];

  const profitTotals = calculateProfitTotals(
    allItems.map((it) => ({ costPrice: Number(it.cost_price_snapshot ?? 0), quantity: Number(it.quantity ?? 0) })),
    rangeOrders.filter((o) => o.status === "paid").reduce((s, o) => s + (o.total_amount || 0), 0)
  );
  const totalItemRevenue = allItems.reduce((s, it) => s + it.unit_price_snapshot * it.quantity, 0);
  const totalItemQty = allItems.reduce((s, it) => s + Number(it.quantity), 0);
  const averageItemValue = totalItemQty > 0 ? Math.round(totalItemRevenue / totalItemQty) : 0;

  const core = computeDashboardCore({
    todayPaid: todayPaid ?? [],
    todayCount,
    tableCount,
    occupied,
    rangeOrders,
    cancelledItems,
    cancelledOrders: cancelledOrders ?? [],
    averageItemValue,
  });

  const revenueTrend = buildRevenueTrend(rangeOrders, granularity);

  // Menu breakdown
  const { data: categories } = await supabase
    .from("menu_categories")
    .select("id, name")
    .eq("organization_id", organizationId);
  const { data: products } = await supabase
    .from("products")
    .select("id, category_id, menu_type")
    .eq("organization_id", organizationId);
  const { data: channels } = await supabase
    .from("sales_channels")
    .select("id, platform_fee_percent")
    .eq("organization_id", organizationId);
  const catMap = new Map((categories ?? []).map((c) => [c.id, c.name]));
  const productMeta = new Map((products ?? []).map((p) => [p.id, p]));
  const channelFeePercent = new Map((channels ?? []).map((channel) => [channel.id, Number(channel.platform_fee_percent ?? 0)]));
  const selectedChannelFees = Math.round(
    (rangeOrders ?? [])
      .filter((o) => o.status === "paid")
      .reduce((sum, order) => {
        const feePercent = order.sales_channel_id ? channelFeePercent.get(order.sales_channel_id) ?? 0 : 0;
        return sum + Number(order.total_amount ?? 0) * (feePercent / 100);
      }, 0)
  );
  const selectedNetProfit = profitTotals.grossProfit - selectedChannelFees;
  const menuBreakdown = buildMenuBreakdown(allItems, productMeta as Map<string, ProductMeta>, catMap);
  const channelBreakdown = buildChannelBreakdown(rangeOrders);
  const topProducts = buildTopProducts(allItems);

  return {
    revenueToday: core.revenueToday,
    ordersToday: core.ordersToday,
    occupiedTables: core.occupiedTables,
    totalTables: core.totalTables,
    selectedNetRevenue: core.selectedNetRevenue,
    selectedCostOfGoods: profitTotals.costOfGoods,
    selectedGrossProfit: profitTotals.grossProfit,
    selectedGrossMarginPercent: profitTotals.grossMarginPercent,
    selectedChannelFees,
    selectedNetProfit,
    selectedOrders: core.selectedOrders,
    paidOrders: core.paidOrders,
    averageItemValue: core.averageItemValue,
    foodAverage: core.foodAverage,
    drinkAverage: core.drinkAverage,
    cancelledItems: core.cancelledItems,
    cancelledOrders: core.cancelledOrders,
    cancelledAfterKitchen: core.cancelledAfterKitchen,
    cancelledAfterTempBill: core.cancelledAfterTempBill,
    cancelledOutOfStock: core.cancelledOutOfStock,
    revenueTrend,
    menuBreakdown,
    channelBreakdown,
    topProducts,
  };
}

export const emptyDashboardSummary = EMPTY;
