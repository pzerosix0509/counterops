import { describe, it, expect } from "vitest";
import { kitchenStatusSchema } from "@/lib/validation/schemas";
import {
  filterKitchenItemsForTab,
  transformKitchenItems,
  type KitchenBoardItem,
  type KitchenBoardRow,
} from "@/lib/calculations/kitchen";

function makeRow(overrides: Partial<KitchenBoardRow> & { orderStatus?: string } = {}): KitchenBoardRow {
  return {
    id: "item-1",
    organization_id: "org-1",
    branch_id: "branch-1",
    order_id: "order-1",
    product_id: "product-1",
    product_name_snapshot: "Cà phê sữa",
    unit_price_snapshot: 30000,
    cost_price_snapshot: 8000,
    quantity: 2,
    note: null,
    kitchen_status: "pending",
    cancellation_stage: null,
    cancelled_by: null,
    cancelled_at: null,
    created_at: "2026-08-08T10:00:00.000Z",
    orders: {
      order_number: "DH-20260808-0001",
      opened_at: "2026-08-08T10:00:00.000Z",
      closed_at: null,
      status: overrides.orderStatus ?? "paid",
      order_type: "dine_in",
      dining_tables: { name: "Bàn 1" },
    },
    ...overrides,
  };
}

describe("UC06 — Update Kitchen Status: schema validation", () => {
  it("UC06.S08 — Sẵn sàng và đã phục vụ là hai bước khác nhau, không kết thúc bàn", () => {
    // Bếp xong món = ready. Nhân viên mang món = served. Cả hai đều hợp lệ.
    // Kết thúc bàn không đi qua kitchen_status; bàn trống chỉ từ POS.
    expect(kitchenStatusSchema.safeParse({ status: "ready" }).success).toBe(true);
    expect(kitchenStatusSchema.safeParse({ status: "served" }).success).toBe(true);
    expect(kitchenStatusSchema.safeParse({ status: "ready" }).data).toEqual({ status: "ready" });
    expect(kitchenStatusSchema.safeParse({ status: "served" }).data).toEqual({ status: "served" });
  });

  it("UC06.S01 — Cập nhật trạng thái món chỉ chấp nhận giá trị hợp lệ", () => {
    // Bước: gửi trạng thái không nằm trong danh sách bếp, ví dụ "in_transit".
    // Kết quả mong đợi: parse thất bại.
    expect(kitchenStatusSchema.safeParse({ status: "in_transit" }).success).toBe(false);
    // Bước: lần lượt gửi 5 trạng thái bếp hợp lệ.
    // Kết quả mong đợi: cả 5 đều parse thành công.
    for (const status of ["pending", "cooking", "ready", "served", "cancelled"]) {
      expect(kitchenStatusSchema.safeParse({ status }).success).toBe(true);
    }
  });
});

describe("UC06 — Update Kitchen Status: kitchen board transform", () => {
  it("UC06.S02 — Chỉ hiển thị món thuộc đơn đã thanh toán", () => {
    // Bước: đưa vào 1 món của đơn paid và 1 món của đơn draft.
    // Kết quả mong đợi: chỉ món của đơn paid xuất hiện trong kết quả.
    const rows = [makeRow({ id: "paid-item" }), makeRow({ id: "draft-item", orderStatus: "draft" })];
    const result = transformKitchenItems(rows);
    expect(result.map((r) => r.item.id)).toEqual(["paid-item"]);
  });

  it("UC06.S03 — Gắn đúng tên bàn, mã đơn và thời gian thanh toán", () => {
    // Bước: đưa vào 1 món có đơn paid kèm dining_tables.name và closed_at.
    // Kết quả mong đợi: tableName = "Bàn 1", orderNumber đúng, paidAt = closed_at.
    const row = makeRow({
      orders: {
        order_number: "DH-20260808-0001",
        opened_at: "2026-08-08T10:00:00.000Z",
        closed_at: "2026-08-08T10:05:00.000Z",
        status: "paid",
        order_type: "takeaway",
        dining_tables: { name: "Bàn 1" },
      },
    });
    const [result] = transformKitchenItems([row]);
    expect(result.tableName).toBe("Bàn 1");
    expect(result.orderNumber).toBe("DH-20260808-0001");
    expect(result.paidAt).toBe("2026-08-08T10:05:00.000Z");
    expect(result.orderType).toBe("takeaway");
  });

  it("UC06.S04 — Bàn không có đơn được gán mặc định 'Mang đi' và không tên bàn", () => {
    // Bước: đưa vào món có orders là null (order bị thiếu).
    // Kết quả mong đợi: không có món nào (order null không phải paid) → kết quả rỗng.
    const result = transformKitchenItems([makeRow({ orders: null as never })]);
    expect(result).toEqual([]);
    // Bước: đưa vào món paid không có thông tin bàn trong order.
    // Kết quả mong đợi: tableName = null, orderNumber = "-", orderType = "takeaway".
    const row = makeRow({ orders: { order_number: null as never, opened_at: "", closed_at: null, status: "paid", order_type: undefined as never, dining_tables: null } });
    const [bare] = transformKitchenItems([row]);
    expect(bare.tableName).toBeNull();
    expect(bare.orderNumber).toBe("-");
    expect(bare.orderType).toBe("takeaway");
  });

  it("UC06.S05 — Món được sắp xếp theo thời gian thanh toán tăng dần", () => {
    // Bước: đưa vào 2 món paid với closed_at khác nhau, đưa theo thứ tự ngược.
    // Kết quả mong đợi: món thanh toán sớm hơn đứng trước.
    const later = makeRow({
      id: "later",
      orders: { ...makeRow().orders!, closed_at: "2026-08-08T11:00:00.000Z", opened_at: "2026-08-08T11:00:00.000Z" },
    });
    const earlier = makeRow({
      id: "earlier",
      orders: { ...makeRow().orders!, closed_at: "2026-08-08T09:00:00.000Z", opened_at: "2026-08-08T09:00:00.000Z" },
    });
    const result = transformKitchenItems([later, earlier]);
    expect(result.map((r) => r.item.id)).toEqual(["earlier", "later"]);
  });
});

describe("UC06 — Kitchen board tab filtering", () => {
  function makeItem(
    id: string,
    orderId: string,
    name: string,
    kitchenStatus: KitchenBoardRow["kitchen_status"]
  ): KitchenBoardItem {
    const row = makeRow({
      id,
      order_id: orderId,
      product_name_snapshot: name,
      kitchen_status: kitchenStatus,
    });
    return transformKitchenItems([row])[0];
  }

  it("UC06.S06 — Hiển thị cả món thường trong cùng đơn có món chế biến", () => {
    const items = [
      makeItem("regular", "order-1", "C", "not_required"),
      makeItem("prepared", "order-1", "D", "pending"),
    ];
    const pending = filterKitchenItemsForTab(items, "pending");
    expect(pending.map((it) => it.item.product_name_snapshot).sort()).toEqual(["C", "D"]);
  });

  it("UC06.S07 — Chỉ hiển thị món thường khi bật cài đặt showRegularItemsInKitchen", () => {
    const items = [makeItem("regular-only", "order-2", "Nước suối", "not_required")];
    expect(filterKitchenItemsForTab(items, "pending")).toEqual([]);
    expect(filterKitchenItemsForTab(items, "pending", { includeRegular: true }).map((it) => it.item.id)).toEqual([
      "regular-only",
    ]);
  });
});
