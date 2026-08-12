import { describe, it, expect } from "vitest";
import { inventorySettingsSchema, operationalSettingsSchema } from "@/lib/validation/schemas";

function validOperational() {
  return {
    allowNegativeInventory: false,
    inventoryDeductionTiming: "payment",
    lowStockAlertEnabled: true,
    defaultLowStockThreshold: 5,
    defaultOrderType: "dine_in",
    defaultTakeawayChannelId: null,
    allowUnpaidOrders: true,
    discountsEnabled: true,
    maxDiscountPercent: 30,
    defaultPaymentMethod: "cash",
    kitchenSoundEnabled: true,
    autoSendToKitchenOnPayment: true,
    showRegularItemsInKitchen: false,
    autoMarkServedOnReady: false,
    businessDayStartTime: "00:00",
    includeServiceFeeInRevenue: true,
    autoGenerateEod: false,
    receiptStoreName: null,
    receiptAddress: null,
    receiptPhone: null,
    receiptLogoUrl: null,
    receiptFooter: "Cảm ơn quý khách.",
    bankCode: null,
    bankAccountNumber: null,
    salesChannels: [{ name: "Tại quán", type: "offline", isActive: true, platformFeePercent: 0 }],
  };
}

describe("UC10 — Configure Settings: inventory settings", () => {
  it("UC10.S01 — Lưu thiết lập kho với giá trị boolean", () => {
    // Bước: gửi allowNegativeInventory = true.
    // Kết quả mong đợi: parse thành công.
    expect(inventorySettingsSchema.safeParse({ allowNegativeInventory: true }).success).toBe(true);
  });

  it("UC10.S02 — Từ chối khi allowNegativeInventory không phải boolean", () => {
    // Bước: gửi allowNegativeInventory = "yes".
    // Kết quả mong đợi: parse thất bại.
    expect(inventorySettingsSchema.safeParse({ allowNegativeInventory: "yes" }).success).toBe(false);
  });
});

describe("UC10 — Configure Settings: operational settings", () => {
  it("UC10.S03 — Chấp nhận payload vận hành hợp lệ", () => {
    // Bước: gửi đầy đủ thiết lập vận hành hợp lệ.
    // Kết quả mong đợi: parse thành công.
    expect(operationalSettingsSchema.safeParse(validOperational()).success).toBe(true);
  });

  it("UC10.S04 — Từ chối phần trăm chiết khấu vượt 100", () => {
    // Bước: gửi maxDiscountPercent = 120.
    // Kết quả mong đợi: parse thất bại với lỗi ở trường maxDiscountPercent.
    const r = operationalSettingsSchema.safeParse({ ...validOperational(), maxDiscountPercent: 120 });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path[0]).toBe("maxDiscountPercent");
  });

  it("UC10.S05 — Từ chối giờ bắt đầu ngày kinh doanh sai định dạng", () => {
    // Bước: gửi businessDayStartTime = "5:99" (giờ chỉ 1 chữ số).
    // Kết quả mong đợi: parse thất bại với lỗi ở trường businessDayStartTime.
    const r = operationalSettingsSchema.safeParse({ ...validOperational(), businessDayStartTime: "5:99" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path[0]).toBe("businessDayStartTime");
  });

  it("UC10.S06 — Từ chối kênh bán thiếu tên", () => {
    // Bước: gửi salesChannels chứa kênh có name rỗng.
    // Kết quả mong đợi: parse thất bại với lỗi ở salesChannels[0].name.
    const r = operationalSettingsSchema.safeParse({
      ...validOperational(),
      salesChannels: [{ name: "", type: "offline", isActive: true, platformFeePercent: 0 }],
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].path[0]).toBe("salesChannels");
      expect(r.error.issues[0].path[1]).toBe(0);
    }
  });

  it("UC10.S07 — Từ chối URL logo hóa đơn không hợp lệ", () => {
    // Bước: gửi receiptLogoUrl = "not-a-url".
    // Kết quả mong đợi: parse thất bại với lỗi ở trường receiptLogoUrl.
    const r = operationalSettingsSchema.safeParse({ ...validOperational(), receiptLogoUrl: "not-a-url" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].path[0]).toBe("receiptLogoUrl");
  });

  it("UC10.S08 — Yêu cầu danh sách kênh bán", () => {
    // Bước: gửi payload thiếu salesChannels.
    // Kết quả mong đợi: parse thất bại.
    const { salesChannels: _salesChannels, ...rest } = validOperational() as any;
    expect(operationalSettingsSchema.safeParse(rest).success).toBe(false);
  });
});
