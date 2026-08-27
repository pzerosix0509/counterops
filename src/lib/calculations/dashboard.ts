// Dashboard aggregation helpers. All currency is integer VND.

export interface DashboardOrderRow {
  id: string;
  status: string;
  total_amount: number | null;
  paid_amount: number | null;
  opened_at: string;
  sales_channel_id: string | null;
  order_type?: string;
  order_number?: string;
}

export interface DashboardItemRow {
  product_id: string | null;
  product_name_snapshot: string;
  unit_price_snapshot: number;
  cost_price_snapshot: number | null;
  quantity: number;
}

export interface CancelledItemRow {
  cancellation_stage: string | null;
}

export interface ProductMeta {
  category_id: string | null;
}

export interface DashboardCore {
  revenueToday: number;
  ordersToday: number;
  occupiedTables: number;
  totalTables: number;
  selectedNetRevenue: number;
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
}

export const ORDER_TYPE_LABELS: Record<string, string> = {
  dine_in: "Tại quán",
  takeaway: "Mang đi",
  delivery: "Giao hàng",
  online: "Online",
};

function bucketKey(openedAt: string, granularity: "hour" | "day"): string {
  const d = new Date(openedAt);
  if (granularity === "hour") {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:00`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function buildRevenueTrend(
  orders: DashboardOrderRow[],
  granularity: "hour" | "day"
): { bucket: string; revenue: number; orders: number }[] {
  const trendMap = new Map<string, { revenue: number; orders: number }>();
  for (const o of orders) {
    if (o.status !== "paid") continue;
    const key = bucketKey(o.opened_at, granularity);
    const cur = trendMap.get(key) ?? { revenue: 0, orders: 0 };
    cur.revenue += o.total_amount || 0;
    cur.orders += 1;
    trendMap.set(key, cur);
  }
  return Array.from(trendMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, v]) => ({ bucket, revenue: v.revenue, orders: v.orders }));
}

export function buildMenuBreakdown(
  allItems: DashboardItemRow[],
  productMeta: Map<string, ProductMeta>,
  catMap: Map<string, string>
): { categoryId: null; categoryName: string; revenue: number; orders: number }[] {
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
  return Array.from(menuMap.entries())
    .map(([categoryName, v]) => ({ categoryId: null, categoryName, revenue: v.revenue, orders: v.orders }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function buildChannelBreakdown(
  orders: DashboardOrderRow[],
  labels: Record<string, string> = ORDER_TYPE_LABELS
): { channelId: null; channelName: string; revenue: number; orders: number }[] {
  const chMap = new Map<string, { revenue: number; orders: number }>();
  for (const o of orders) {
    if (o.status !== "paid") continue;
    const name = o.order_type ? labels[o.order_type] ?? "Khác" : "Khác";
    const cur = chMap.get(name) ?? { revenue: 0, orders: 0 };
    cur.revenue += o.total_amount || 0;
    cur.orders += 1;
    chMap.set(name, cur);
  }
  return Array.from(chMap.entries())
    .map(([channelName, v]) => ({ channelId: null, channelName, revenue: v.revenue, orders: v.orders }))
    .sort((a, b) => b.revenue - a.revenue);
}

export function buildTopProducts(
  allItems: DashboardItemRow[]
): { productId: string; name: string; quantity: number; revenue: number; costOfGoods: number; grossProfit: number }[] {
  const productMap = new Map<string, { quantity: number; revenue: number; costOfGoods: number; name: string }>();
  for (const it of allItems) {
    const key = it.product_id ?? it.product_name_snapshot;
    const cur = productMap.get(key) ?? { quantity: 0, revenue: 0, costOfGoods: 0, name: it.product_name_snapshot };
    cur.quantity += Number(it.quantity);
    cur.revenue += it.unit_price_snapshot * it.quantity;
    cur.costOfGoods += Number(it.cost_price_snapshot ?? 0) * Number(it.quantity);
    productMap.set(key, cur);
  }
  return Array.from(productMap.values())
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
}

export function computeDashboardCore(args: {
  todayPaid: { total_amount: number | null }[];
  todayCount: number | null;
  tableCount: number | null;
  occupied: number | null;
  rangeOrders: DashboardOrderRow[];
  cancelledItems: CancelledItemRow[];
  cancelledOrders: unknown[];
  averageItemValue: number;
}): DashboardCore {
  const { todayPaid, todayCount, tableCount, occupied, rangeOrders, cancelledItems, cancelledOrders, averageItemValue } = args;
  const revenueToday = (todayPaid ?? []).reduce((s, o) => s + (o.total_amount || 0), 0);
  const selectedOrders = (rangeOrders ?? []).length;
  const selectedNetRevenue = (rangeOrders ?? [])
    .filter((o) => o.status === "paid")
    .reduce((s, o) => s + (o.total_amount || 0), 0);
  const paidOrders = (rangeOrders ?? []).filter((o) => o.status === "paid").length;

  const cancelledItemsCount = (cancelledItems ?? []).length;
  const cancelledOrdersCount = (cancelledOrders ?? []).length;
  const cancelledAfterKitchen = (cancelledItems ?? []).filter((it) => it.cancellation_stage === "after_kitchen").length;
  const cancelledAfterTempBill = (cancelledItems ?? []).filter((it) => it.cancellation_stage === "after_temp_bill").length;
  const cancelledOutOfStock = (cancelledItems ?? []).filter((it) => it.cancellation_stage === "out_of_stock").length;

  return {
    revenueToday,
    ordersToday: todayCount ?? 0,
    occupiedTables: occupied ?? 0,
    totalTables: tableCount ?? 0,
    selectedNetRevenue,
    selectedOrders,
    paidOrders,
    averageItemValue,
    foodAverage: averageItemValue,
    drinkAverage: averageItemValue,
    cancelledItems: cancelledItemsCount,
    cancelledOrders: cancelledOrdersCount,
    cancelledAfterKitchen,
    cancelledAfterTempBill,
    cancelledOutOfStock,
  };
}
