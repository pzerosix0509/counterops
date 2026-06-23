import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { DateRange } from "@/lib/date/ranges";
import { calculateProfitTotals } from "@/lib/calculations/orders";

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
    { data: rangeOrders },
    { data: rangeItems },
    { data: cancelledItems },
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

  const revenueToday = (todayPaid ?? []).reduce((s, o) => s + (o.total_amount || 0), 0);
  const ordersToday = todayCount ?? 0;
  const totalTables = tableCount ?? 0;
  const occupiedTables = occupied ?? 0;
  const selectedOrders = (rangeOrders ?? []).length;
  const selectedNetRevenue = (rangeOrders ?? [])
    .filter((o) => o.status === "paid")
    .reduce((s, o) => s + (o.total_amount || 0), 0);
  const paidOrders = (rangeOrders ?? []).filter((o) => o.status === "paid").length;

  const allItems = (rangeItems ?? []).filter((it: any) => it.orders?.status === "paid");
  const totalItemRevenue = allItems.reduce((s, it) => s + it.unit_price_snapshot * it.quantity, 0);
  const profitTotals = calculateProfitTotals(
    allItems.map((it: any) => ({ costPrice: Number(it.cost_price_snapshot ?? 0), quantity: Number(it.quantity ?? 0) })),
    selectedNetRevenue
  );
  const totalItemQty = allItems.reduce((s, it) => s + Number(it.quantity), 0);
  const averageItemValue = totalItemQty > 0 ? Math.round(totalItemRevenue / totalItemQty) : 0;
  // foodItems aggregated for average calculations (reserved for future menu_type breakdown)

  const foodAverage = averageItemValue;

  // menu type averages require product lookup; keep them tied to snapshot for MVP
  const drinkAverage = averageItemValue;

  // Cancellations
  const cancelledItemsCount = (cancelledItems ?? []).length;
  const cancelledOrdersCount = (cancelledOrders ?? []).length;
  const cancelledAfterKitchen = (cancelledItems ?? []).filter((it: any) => it.cancellation_stage === "after_kitchen").length;
  const cancelledAfterTempBill = (cancelledItems ?? []).filter((it: any) => it.cancellation_stage === "after_temp_bill").length;
  const cancelledOutOfStock = (cancelledItems ?? []).filter((it: any) => it.cancellation_stage === "out_of_stock").length;

  // Revenue trend
  const trendMap = new Map<string, { revenue: number; orders: number }>();
  for (const o of rangeOrders ?? []) {
    if (o.status !== "paid") continue;
    const d = new Date(o.opened_at);
    const key = granularity === "hour"
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const cur = trendMap.get(key) ?? { revenue: 0, orders: 0 };
    cur.revenue += o.total_amount || 0;
    cur.orders += 1;
    trendMap.set(key, cur);
  }
  const revenueTrend = Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, v]) => ({ bucket, revenue: v.revenue, orders: v.orders }));

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
  const menuMap = new Map<string, { revenue: number; orders: number }>();
  for (const it of allItems) {
    const meta = it.product_id ? productMeta.get(it.product_id) : null;
    const categoryId = meta?.category_id ?? null;
    const categoryName = categoryId ? catMap.get(categoryId) ?? "Khác" : "Chưa phân loại";
    const cur = menuMap.get(categoryName) ?? { revenue: 0, orders: 0 };
    cur.revenue += it.unit_price_snapshot * it.quantity;
    cur.orders += 1;
    menuMap.set(categoryName, cur);
  }
  const menuBreakdown = Array.from(menuMap.entries())
    .map(([categoryName, v]) => ({ categoryId: null, categoryName, revenue: v.revenue, orders: v.orders }))
    .sort((a, b) => b.revenue - a.revenue);

  // Channel breakdown uses the actual order fulfillment type. The sales channel
  // dropdown can drift from dine-in/takeaway, but order_type is the source of truth
  // for "Tại quán", "Mang đi", "Giao hàng", and "Online" reporting.
  const orderTypeLabel: Record<string, string> = {
    dine_in: "Tại quán",
    takeaway: "Mang đi",
    delivery: "Giao hàng",
    online: "Online",
  };
  const chMap = new Map<string, { revenue: number; orders: number }>();
  for (const o of rangeOrders ?? []) {
    if (o.status !== "paid") continue;
    const name = orderTypeLabel[o.order_type as string] ?? "Khác";
    const cur = chMap.get(name) ?? { revenue: 0, orders: 0 };
    cur.revenue += o.total_amount || 0;
    cur.orders += 1;
    chMap.set(name, cur);
  }
  const channelBreakdown = Array.from(chMap.entries())
    .map(([channelName, v]) => ({ channelId: null, channelName, revenue: v.revenue, orders: v.orders }))
    .sort((a, b) => b.revenue - a.revenue);

  // Top products
  const productMap = new Map<string, { quantity: number; revenue: number; costOfGoods: number; name: string }>();
  for (const it of allItems) {
    const key = it.product_id ?? it.product_name_snapshot;
    const cur = productMap.get(key) ?? { quantity: 0, revenue: 0, costOfGoods: 0, name: it.product_name_snapshot };
    cur.quantity += Number(it.quantity);
    cur.revenue += it.unit_price_snapshot * it.quantity;
    cur.costOfGoods += Number(it.cost_price_snapshot ?? 0) * Number(it.quantity);
    productMap.set(key, cur);
  }
  const topProducts = Array.from(productMap.values())
    .map((p, idx) => ({
      productId: idx.toString(),
      name: p.name,
      quantity: p.quantity,
      revenue: p.revenue,
      costOfGoods: Math.round(p.costOfGoods),
      grossProfit: p.revenue - Math.round(p.costOfGoods),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  return {
    revenueToday,
    ordersToday,
    occupiedTables,
    totalTables,
    selectedNetRevenue,
    selectedCostOfGoods: profitTotals.costOfGoods,
    selectedGrossProfit: profitTotals.grossProfit,
    selectedGrossMarginPercent: profitTotals.grossMarginPercent,
    selectedChannelFees,
    selectedNetProfit,
    selectedOrders,
    paidOrders,
    averageItemValue,
    foodAverage,
    drinkAverage,
    cancelledItems: cancelledItemsCount,
    cancelledOrders: cancelledOrdersCount,
    cancelledAfterKitchen,
    cancelledAfterTempBill,
    cancelledOutOfStock,
    revenueTrend,
    menuBreakdown,
    channelBreakdown,
    topProducts,
  };
}

export const emptyDashboardSummary = EMPTY;
