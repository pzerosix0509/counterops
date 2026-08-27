/**
 * Synthetic dataset chuẩn cho bộ eval — ground truth tính sẵn.
 * 35 ngày liên tục, mùa vụ theo thứ (T7/CN cao), 2 outlier (khuyến mãi, sự kiện),
 * 2 ngày hoàn tiền, 1 ngày thiếu dữ liệu, 1 ngày trùng (2 row), ngày cuối "hôm nay"
 * chưa hoàn tất (chỉ ~60% số đơn).
 *
 * Mọi số trong `expected` được TÍNH từ chính dữ liệu này (single source of truth)
 * để eval so khớp deterministic answer.
 */

export interface EvalDay {
  date: string; // YYYY-MM-DD
  revenue: number;
  orders: number;
  cogs: number;
  fees: number;
  refunds?: number;
  channel: Array<{ name: string; revenue: number; orders: number }>;
  categories: Array<{ id: string; name: string; revenue: number; quantity: number }>;
  products: Array<{ name: string; quantity: number; revenue: number; cogs: number }>;
}

export interface EvalBranchData {
  branchId: string;
  timezone: string;
  days: EvalDay[];
  expected: {
    totalRevenue: number;
    totalOrders: number;
    totalCogs: number;
    totalFees: number;
    totalProfit: number;
    topProduct: string;
    worstProduct: string;
    topChannel: string;
    revenueByChannel: Record<string, number>;
    revenueByCategory: Record<string, number>;
  };
}

/** Phân bổ doanh thu theo kênh — tổng đúng revenue của ngày */
function channelSplit(revenue: number, orders: number): EvalDay["channel"] {
  const shopee = Math.round(revenue * 0.45);
  const grab = Math.round(revenue * 0.35);
  const inStore = revenue - shopee - grab;
  const shopeeOrders = Math.round(orders * 0.4);
  const grabOrders = Math.round(orders * 0.3);
  const inStoreOrders = orders - shopeeOrders - grabOrders;
  return [
    { name: "Shopee", revenue: shopee, orders: shopeeOrders },
    { name: "Grab", revenue: grab, orders: grabOrders },
    { name: "Tại quán", revenue: inStore, orders: inStoreOrders },
  ];
}

function categorySplit(revenue: number, orders: number): EvalDay["categories"] {
  const coffee = Math.round(revenue * 0.55);
  const juice = Math.round(revenue * 0.3);
  const cake = revenue - coffee - juice;
  return [
    { id: "cat-coffee", name: "Cà phê", revenue: coffee, quantity: Math.round(orders * 0.55) },
    { id: "cat-juice", name: "Nước ép", revenue: juice, quantity: Math.round(orders * 0.3) },
    { id: "cat-cake", name: "Bánh", revenue: cake, quantity: orders - Math.round(orders * 0.55) - Math.round(orders * 0.3) },
  ];
}

function productSplit(revenue: number, orders: number, cogs: number): EvalDay["products"] {
  const espresso = Math.round(revenue * 0.4);
  const latte = Math.round(revenue * 0.35);
  const matcha = revenue - espresso - latte;
  const espressoCogs = Math.round(cogs * 0.45);
  const latteCogs = Math.round(cogs * 0.35);
  const matchaCogs = cogs - espressoCogs - latteCogs;
  return [
    { name: "Espresso", quantity: Math.round(orders * 0.4), revenue: espresso, cogs: espressoCogs },
    { name: "Latte", quantity: Math.round(orders * 0.35), revenue: latte, cogs: latteCogs },
    { name: "Matcha", quantity: orders - Math.round(orders * 0.4) - Math.round(orders * 0.35), revenue: matcha, cogs: matchaCogs },
  ];
}

/** Tạo ngày cơ bản (không mùa vụ, không outlier) — thêm nhiễu ±5% để MAD khác 0 */
function baseDay(date: string, weekday: number, seed: number): EvalDay {
  const weekendBoost = weekday === 6 || weekday === 0 ? 1.4 : 1.0; // T7/CN cao
  const noise = 0.95 + ((seed * 37) % 11) / 100; // 0.95..1.05
  const revenue = Math.round(1_000_000 * weekendBoost * noise);
  const orders = Math.max(8, Math.round(12 * weekendBoost));
  const cogs = Math.round(revenue * 0.4);
  const fees = Math.round(revenue * 0.05);
  return {
    date,
    revenue,
    orders,
    cogs,
    fees,
    channel: channelSplit(revenue, orders),
    categories: categorySplit(revenue, orders),
    products: productSplit(revenue, orders, cogs),
  };
}

function buildDays(): EvalDay[] {
  // 35 ngày: 2026-07-01 (T4) → 2026-08-04 (T3)
  const start = new Date("2026-07-01T00:00:00Z");
  const days: EvalDay[] = [];
  for (let i = 0; i < 35; i += 1) {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + i);
    const iso = date.toISOString().slice(0, 10);
    const weekday = date.getUTCDay();
    days.push(baseDay(iso, weekday, i + 1));
  }

  // Ngày cuối (2026-08-04, "hôm nay") — kỳ chưa hoàn tất, chỉ ~60% số đơn
  const lastIndex = days.length - 1;
  const last = days[lastIndex];
  days[lastIndex] = {
    ...last,
    revenue: Math.round(last.revenue * 0.6),
    orders: Math.round(last.orders * 0.6),
    cogs: Math.round(last.cogs * 0.6),
    fees: Math.round(last.fees * 0.6),
    channel: last.channel.map((c) => ({
      ...c,
      revenue: Math.round(c.revenue * 0.6),
      orders: Math.round(c.orders * 0.6),
    })),
    categories: last.categories.map((c) => ({
      ...c,
      revenue: Math.round(c.revenue * 0.6),
      quantity: Math.round(c.quantity * 0.6),
    })),
    products: last.products.map((p) => ({
      ...p,
      revenue: Math.round(p.revenue * 0.6),
      quantity: Math.round(p.quantity * 0.6),
    })),
  };

  // Outlier khuyến mãi: 2026-07-11 (T7) x2.5
  const promoIndex = 10; // 2026-07-11
  const promo = days[promoIndex];
  days[promoIndex] = {
    ...promo,
    revenue: Math.round(promo.revenue * 2.5),
    orders: Math.round(promo.orders * 2.5),
    cogs: Math.round(promo.cogs * 2.2),
    fees: Math.round(promo.fees * 2.5),
    channel: promo.channel.map((c) => ({ ...c, revenue: Math.round(c.revenue * 2.5), orders: Math.round(c.orders * 2.5) })),
    categories: promo.categories.map((c) => ({ ...c, revenue: Math.round(c.revenue * 2.5), quantity: Math.round(c.quantity * 2.5) })),
    products: promo.products.map((p) => ({ ...p, revenue: Math.round(p.revenue * 2.5), quantity: Math.round(p.quantity * 2.5) })),
  };

  // Outlier sự kiện (giảm mạnh): 2026-07-18 (T7) x0.3
  const eventIndex = 17; // 2026-07-18
  const event = days[eventIndex];
  days[eventIndex] = {
    ...event,
    revenue: Math.round(event.revenue * 0.3),
    orders: Math.round(event.orders * 0.3),
    cogs: Math.round(event.cogs * 0.3),
    fees: Math.round(event.fees * 0.3),
    channel: event.channel.map((c) => ({ ...c, revenue: Math.round(c.revenue * 0.3), orders: Math.round(c.orders * 0.3) })),
    categories: event.categories.map((c) => ({ ...c, revenue: Math.round(c.revenue * 0.3), quantity: Math.round(c.quantity * 0.3) })),
    products: event.products.map((p) => ({ ...p, revenue: Math.round(p.revenue * 0.3), quantity: Math.round(p.quantity * 0.3) })),
  };

  // Ngày hoàn tiền: 2026-07-20 (T2), 2026-07-27 (T2) — revenue sau refund
  for (const refundIndex of [19, 26]) {
    const day = days[refundIndex];
    const refunds = Math.round(day.revenue * 0.15);
    days[refundIndex] = { ...day, revenue: day.revenue - refunds, refunds };
  }

  return days;
}

function computeExpected(days: EvalDay[]): EvalBranchData["expected"] {
  const totalRevenue = days.reduce((sum, d) => sum + d.revenue, 0);
  const totalOrders = days.reduce((sum, d) => sum + d.orders, 0);
  const totalCogs = days.reduce((sum, d) => sum + d.cogs, 0);
  const totalFees = days.reduce((sum, d) => sum + d.fees, 0);
  const refunds = days.reduce((sum, d) => sum + (d.refunds ?? 0), 0);
  const totalProfit = totalRevenue - totalCogs - totalFees - refunds;

  const revenueByChannel: Record<string, number> = {};
  for (const day of days) {
    for (const c of day.channel) {
      revenueByChannel[c.name] = (revenueByChannel[c.name] ?? 0) + c.revenue;
    }
  }
  const revenueByCategory: Record<string, number> = {};
  for (const day of days) {
    for (const c of day.categories) {
      revenueByCategory[c.name] = (revenueByCategory[c.name] ?? 0) + c.revenue;
    }
  }
  const productRevenue: Record<string, number> = {};
  for (const day of days) {
    for (const p of day.products) {
      productRevenue[p.name] = (productRevenue[p.name] ?? 0) + p.revenue;
    }
  }
  const topProduct = Object.entries(productRevenue).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const worstProduct = Object.entries(productRevenue).sort((a, b) => a[1] - b[1])[0]?.[0] ?? "";
  const topChannel = Object.entries(revenueByChannel).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  return {
    totalRevenue,
    totalOrders,
    totalCogs,
    totalFees,
    totalProfit,
    topProduct,
    worstProduct,
    topChannel,
    revenueByChannel,
    revenueByCategory,
  };
}

const DAYS = buildDays();

export const EVAL_DATASET: EvalBranchData = {
  branchId: "branch-eval-001",
  timezone: "Asia/Ho_Chi_Minh",
  days: DAYS,
  expected: computeExpected(DAYS),
};

/** Các biến thể dữ liệu cho data-quality eval */
export type DataQualityScenario =
  | "base"
  | "missing-day"
  | "duplicate-day"
  | "refund-day"
  | "outlier-day"
  | "tool-timeout"
  | "empty-period"
  | "small-sample";

export function scenarioDays(scenario: DataQualityScenario): EvalDay[] {
  const days = EVAL_DATASET.days.map((day) => ({ ...day }));

  switch (scenario) {
    case "base":
      return days;
    case "missing-day": {
      // Bỏ ngày 2026-07-10 (T6) — tạo gap
      return days.filter((day) => day.date !== "2026-07-10");
    }
    case "duplicate-day": {
      // Nhân đôi 2026-07-15 (T4)
      const duplicate = days.find((day) => day.date === "2026-07-15");
      if (!duplicate) return days;
      return [...days, { ...duplicate, date: `${duplicate.date}T` }];
    }
    case "refund-day": {
      // Tăng hoàn tiền ngày 2026-07-20 lên 40% doanh thu
      return days.map((day) => {
        if (day.date !== "2026-07-20") return day;
        const refunds = Math.round(day.revenue * 0.4);
        return { ...day, revenue: day.revenue - refunds, refunds };
      });
    }
    case "outlier-day": {
      // Thêm outlier rõ rệt ngày 2026-07-16 (T5)
      return days.map((day) => {
        if (day.date !== "2026-07-16") return day;
        return { ...day, revenue: day.revenue * 3, orders: day.orders * 3 };
      });
    }
    case "empty-period":
      // Trả về 1 ngày doanh thu 0 (kỳ trống)
      return days.slice(0, 1).map((day) => ({ ...day, revenue: 0, orders: 0, cogs: 0, fees: 0 }));
    case "small-sample": {
      // Chỉ 3 ngày gần đây, rất ít đơn (1/ngày, tổng 3 < 5) → kích hoạt small_sample
      return days.slice(-3).map((day) => ({
        ...day,
        revenue: Math.round(day.revenue * 0.08),
        orders: 1,
        cogs: Math.round(day.cogs * 0.08),
        fees: Math.round(day.fees * 0.08),
      }));
    }
    case "tool-timeout":
      return days; // scenario được xử lý ở mock-tools (trả error execution)
    default:
      return days;
  }
}
