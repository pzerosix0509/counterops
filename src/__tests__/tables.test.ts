import { describe, it, expect } from "vitest";
import { areaSchema, tableSchema, tableStatusSchema } from "@/lib/validation/schemas";
import { canFreeTable } from "@/lib/calculations/tables";
import type { MembershipRole } from "@/types/database";

describe("UC03 — Manage Tables: schema validation", () => {
  it("UC03.S01 — Tạo khu vực với tên hợp lệ", () => {
    // Bước: nhập tên khu vực "Khu A", không chỉ định sortOrder.
    // Kết quả mong đợi: parse thành công, sortOrder nhận giá trị mặc định 0.
    const r = areaSchema.safeParse({ name: "Khu A" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.sortOrder).toBe(0);
  });

  it("UC03.S02 — Tạo khu vực bị từ chối khi tên trống", () => {
    // Bước: nhập tên khu vực là chuỗi rỗng.
    // Kết quả mong đợi: parse thất bại do name phải có tối thiểu 1 ký tự.
    expect(areaSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("UC03.S03 — Tạo bàn hợp lệ với seats mặc định", () => {
    // Bước: nhập branchId, name, không chỉ định seats/sortOrder.
    // Kết quả mong đợi: parse thành công, seats = 2, sortOrder = 0.
    const r = tableSchema.safeParse({
      branchId: "00000000-0000-0000-0000-000000000000",
      name: "Bàn 1",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.seats).toBe(2);
      expect(r.data.sortOrder).toBe(0);
    }
  });

  it("UC03.S04 — Tạo bàn bị từ chối khi thiếu branchId hoặc name", () => {
    // Bước: gửi payload chỉ có name, không có branchId.
    // Kết quả mong đợi: parse thất bại do branchId là uuid bắt buộc.
    expect(tableSchema.safeParse({ name: "Bàn 2" }).success).toBe(false);
    // Bước: gửi payload có branchId nhưng name rỗng.
    // Kết quả mong đợi: parse thất bại do name tối thiểu 1 ký tự.
    expect(
      tableSchema.safeParse({ branchId: "00000000-0000-0000-0000-000000000000", name: "" }).success
    ).toBe(false);
  });

  it("UC03.S05 — Tạo bàn bị từ chối khi seats nhỏ hơn 1", () => {
    // Bước: nhập seats = 0.
    // Kết quả mong đợi: parse thất bại do seats tối thiểu 1.
    const r = tableSchema.safeParse({
      branchId: "00000000-0000-0000-0000-000000000000",
      name: "Bàn 3",
      seats: 0,
    });
    expect(r.success).toBe(false);
  });

  it("UC03.S06 — Cập nhật trạng thái bàn chỉ chấp nhận giá trị hợp lệ", () => {
    // Bước: gửi trạng thái không nằm trong danh sách cho phép, ví dụ "broken".
    // Kết quả mong đợi: parse thất bại.
    expect(tableStatusSchema.safeParse({ status: "broken" }).success).toBe(false);
    // Bước: lần lượt gửi 4 trạng thái hợp lệ.
    // Kết quả mong đợi: cả 4 đều parse thành công.
    for (const status of ["available", "occupied", "reserved", "disabled"]) {
      expect(tableStatusSchema.safeParse({ status }).success).toBe(true);
    }
  });
});

describe("UC03 — Manage Tables: business rule canFreeTable", () => {
  it("UC03.S07 — Nhân viên bị chặn giải phóng bàn đang có đơn mở", () => {
    // Bước: vai trò cashier, bàn đang occupied, có đơn mở.
    // Kết quả mong đợi: canFreeTable = false → hệ thống từ chối.
    expect(canFreeTable("cashier", "occupied", true)).toBe(false);
  });

  it("UC03.S08 — Quản lý được phép giải phóng bàn dù có đơn mở", () => {
    // Bước: vai trò manager/owner/admin, bàn occupied, có đơn mở.
    // Kết quả mong đợi: canFreeTable = true → được phép chuyển trạng thái.
    const bypass: MembershipRole[] = ["manager", "owner", "admin"];
    for (const role of bypass) {
      expect(canFreeTable(role, "occupied", true)).toBe(true);
    }
  });

  it("UC03.S09 — Bàn occupied nhưng không còn đơn mở luôn giải phóng được", () => {
    // Bước: bàn occupied, không có đơn mở, dù nhân viên.
    // Kết quả mong đợi: canFreeTable = true cho mọi vai trò.
    expect(canFreeTable("cashier", "occupied", false)).toBe(true);
    expect(canFreeTable("staff", "occupied", false)).toBe(true);
  });

  it("UC03.S10 — Bàn không phải occupied không cần kiểm tra đơn mở", () => {
    // Bước: bàn available/reserved/disabled, không xét đơn mở.
    // Kết quả mong đợi: canFreeTable luôn true.
    expect(canFreeTable("cashier", "available", true)).toBe(true);
    expect(canFreeTable("cashier", "reserved", true)).toBe(true);
    expect(canFreeTable("cashier", "disabled", true)).toBe(true);
  });
});
