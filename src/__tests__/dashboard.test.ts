import { describe, it, expect } from "vitest";
import {
  buildRevenueTrend,
  buildMenuBreakdown,
  buildChannelBreakdown,
  buildTopProducts,
  computeDashboardCore,
  type DashboardOrderRow,
  type DashboardItemRow,
  type CancelledItemRow,
} from "@/lib/calculations/dashboard";

function order(partial: Partial<DashboardOrderRow>): DashboardOrderRow {
  return {
    id: "o1",
    status: "paid",
    total_amount: 100000,
    paid_amount: 100000,
    opened_at: "2026-08-08T10:00:00.000Z",
    sales_channel_id: null,
    order_type: "dine_in",
    order_number: "DH-20260808-0001",
    ...partial,
  };
}

function item(partial: Partial<DashboardItemRow>): DashboardItemRow {
  return {
    product_id: "p1",
    product_name_snapshot: "Cà phê sữa",
    unit_price_snapshot: 30000,
    cost_price_snapshot: 8000,
    quantity: 2,
    ...partial,
  };
}

describe("UC07 — Dashboard/Report: revenue trend", () => {
  process.env.TZ = "UTC";
  it("UC07.S01 — Chỉ cộng doanh thu của đơn đã thanh toán", () => {
    // Bước: đưa vào 1 đơn paid và 1 đơn draft.
    // Kết quả mong đợi: chỉ đơn paid xuất hiện trong xu hướng.
    const trend = buildRevenueTrend([order({ id: "a", status: "paid" }), order({ id: "b", status: "draft" })], "day");
    expect(trend).toHaveLength(1);
    expect(trend[0].orders).toBe(1);
    expect(trend[0].revenue).toBe(100000);
  });

  it("UC07.S02 — Gom đơn theo ngày", () => {
    // Bước: đưa 2 đơn paid cùng ngày 2026-08-08.
    // Kết quả mong đợi: 1 bucket ngày 2026-08-08, revenue = tổng, orders = 2.
    const trend = buildRevenueTrend(
      [order({ total_amount: 40000, opened_at: "2026-08-08T08:00:00.000Z" }), order({ total_amount: 60000, opened_at: "2026-08-08T20:00:00.000Z" })],
      "day"
    );
    expect(trend).toEqual([{ bucket: "2026-08-08", revenue: 100000, orders: 2 }]);
  });

  it("UC07.S03 — Gom đơn theo giờ và sắp xếp theo thời gian", () => {
    // Bước: đưa 2 đơn paid ở 2 giờ khác nhau, đưa theo thứ tự đảo ngược.
    // Kết quả mong đợi: 2 bucket giờ được sắp xếp tăng dần.
    const trend = buildRevenueTrend(
      [
        order({ id: "a", total_amount: 50000, opened_at: "2026-08-08T18:00:00.000Z" }),
        order({ id: "b", total_amount: 70000, opened_at: "2026-08-08T09:00:00.000Z" }),
      ],
      "hour"
    );
    expect(trend.map((t) => t.bucket)).toEqual(["2026-08-08 09:00", "2026-08-08 18:00"]);
    expect(trend[0].revenue).toBe(70000);
  });
});

describe("UC07 — Dashboard/Report: menu breakdown", () => {
  it("UC07.S04 — Gom doanh thu theo danh mục và sắp xếp giảm dần", () => {
    // Bước: đưa 2 món thuộc 2 danh mục khác nhau.
    // Kết quả mong đợi: danh mục doanh thu cao đứng trước, categoryId luôn null.
    const productMeta = new Map([["p1", { category_id: "c1" }], ["p2", { category_id: "c2" }]]);
    const catMap = new Map([["c1", "Cà phê"], ["c2", "Trà"]]);
    const items = [
      item({ product_id: "p1", unit_price_snapshot: 10000, quantity: 2, product_name_snapshot: "A" }),
      item({ product_id: "p2", unit_price_snapshot: 1000, quantity: 1, product_name_snapshot: "B" }),
    ];
    const breakdown = buildMenuBreakdown(items, productMeta, catMap);
    expect(breakdown).toEqual([
      { categoryId: null, categoryName: "Cà phê", revenue: 20000, orders: 1 },
      { categoryId: null, categoryName: "Trà", revenue: 1000, orders: 1 },
    ]);
  });

  it("UC07.S05 — Món không phân loại và danh mục thiếu được gán nhãn mặc định", () => {
    // Bước: 1 món không có product_id (null), 1 món thuộc danh mục không có tên.
    // Kết quả mong đợi: nhãn "Chưa phân loại" và "Khác".
    const productMeta = new Map([["p2", { category_id: "missing" }]]);
    const items = [
      item({ product_id: null, unit_price_snapshot: 10000, quantity: 1, product_name_snapshot: "X" }),
      item({ product_id: "p2", unit_price_snapshot: 20000, quantity: 1, product_name_snapshot: "Y" }),
    ];
    const breakdown = buildMenuBreakdown(items, productMeta, new Map());
    const names = breakdown.map((b) => b.categoryName);
    expect(names).toContain("Chưa phân loại");
    expect(names).toContain("Khác");
  });
});

describe("UC07 — Dashboard/Report: channel breakdown", () => {
  it("UC07.S06 — Gom doanh thu theo loại đơn", () => {
    // Bước: đưa 1 đơn dine_in và 1 đơn takeaway, cả hai paid.
    // Kết quả mong đợi: 2 nhóm "Tại quán" và "Mang đi" với doanh thu tương ứng.
    const breakdown = buildChannelBreakdown([
      order({ order_type: "dine_in", total_amount: 80000 }),
      order({ order_type: "takeaway", total_amount: 20000 }),
    ]);
    expect(breakdown).toEqual([
      { channelId: null, channelName: "Tại quán", revenue: 80000, orders: 1 },
      { channelId: null, channelName: "Mang đi", revenue: 20000, orders: 1 },
    ]);
  });

  it("UC07.S07 — Loại đơn không xác định gộp vào 'Khác'", () => {
    // Bước: đưa đơn paid có order_type không xác định.
    // Kết quả mong đợi: nhóm "Khác".
    const breakdown = buildChannelBreakdown([order({ order_type: "unknown", total_amount: 50000 })]);
    expect(breakdown[0].channelName).toBe("Khác");
  });
});

describe("UC07 — Dashboard/Report: top products", () => {
  it("UC07.S08 — Tính số lượng, doanh thu, giá vốn và lợi nhuận gộp", () => {
    // Bước: đưa 1 món 2 phần giá bán 30000, giá vốn 8000.
    // Kết quả mong đợi: quantity 2, revenue 60000, costOfGoods 16000, grossProfit 44000.
    const [top] = buildTopProducts([item({ quantity: 2, unit_price_snapshot: 30000, cost_price_snapshot: 8000 })]);
    expect(top.quantity).toBe(2);
    expect(top.revenue).toBe(60000);
    expect(top.costOfGoods).toBe(16000);
    expect(top.grossProfit).toBe(44000);
  });

  it("UC07.S09 — Sắp xếp theo doanh thu và giới hạn 10 món", () => {
    // Bước: đưa 12 món có doanh thu tăng dần.
    // Kết quả mong đợi: món doanh thu cao đứng đầu và chỉ còn 10 món.
    const items = Array.from({ length: 12 }, (_, i) => item({ product_id: `p${i}`, product_name_snapshot: `Món ${i}`, unit_price_snapshot: (i + 1) * 1000, quantity: 1 }));
    const top = buildTopProducts(items);
    expect(top).toHaveLength(10);
    expect(top[0].name).toBe("Món 11");
    expect(top[9].name).toBe("Món 2");
  });
});

describe("UC07 — Dashboard/Report: core summary", () => {
  it("UC07.S10 — Tổng hợp các chỉ số cốt lõi", () => {
    // Bước: cung cấp dữ liệu giả lập với 1 đơn paid hôm nay, 2 bàn, 1 bàn occupied.
    // Kết quả mong đợi: revenueToday/ordersToday/totalTables/occupiedTables/số đơn chọn đều đúng.
    const core = computeDashboardCore({
      todayPaid: [{ total_amount: 100000 }],
      todayCount: 1,
      tableCount: 4,
      occupied: 2,
      rangeOrders: [order({ status: "paid", total_amount: 100000 })],
      cancelledItems: [] as CancelledItemRow[],
      cancelledOrders: [],
      averageItemValue: 100000,
    });
    expect(core.revenueToday).toBe(100000);
    expect(core.ordersToday).toBe(1);
    expect(core.totalTables).toBe(4);
    expect(core.occupiedTables).toBe(2);
    expect(core.selectedOrders).toBe(1);
    expect(core.paidOrders).toBe(1);
    expect(core.averageItemValue).toBe(100000);
    expect(core.foodAverage).toBe(100000);
    expect(core.drinkAverage).toBe(100000);
  });

  it("UC07.S11 — Tính số món hủy theo giai đoạn", () => {
    // Bước: cung cấp 3 món hủy ở 3 giai đoạn khác nhau.
    // Kết quả mong đợi: mỗi loại đếm đúng 1.
    const core = computeDashboardCore({
      todayPaid: [],
      todayCount: 0,
      tableCount: 0,
      occupied: 0,
      rangeOrders: [],
      cancelledItems: [
        { cancellation_stage: "after_kitchen" },
        { cancellation_stage: "after_temp_bill" },
        { cancellation_stage: "out_of_stock" },
      ],
      cancelledOrders: [{ id: "c1" }],
      averageItemValue: 0,
    });
    expect(core.cancelledItems).toBe(3);
    expect(core.cancelledOrders).toBe(1);
    expect(core.cancelledAfterKitchen).toBe(1);
    expect(core.cancelledAfterTempBill).toBe(1);
    expect(core.cancelledOutOfStock).toBe(1);
  });
});
