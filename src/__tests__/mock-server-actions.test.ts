import { describe, it, expect } from "vitest";
import { RedirectError } from "./mock-server-setup";
import {
  MOCK_ORG_ID,
  MOCK_BRANCH_ID,
  MOCK_PRODUCTS,
  MOCK_TABLES,
  MOCK_INVENTORY_ITEMS,
} from "@/lib/mock/data";

import { createCategory, createProduct, toggleProductActive } from "@/server/actions/menu";
import { createArea, createTable, updateTableStatus } from "@/server/actions/tables";
import { createInventoryItem, createInventoryMovement } from "@/server/actions/inventory";
import { updateInventorySettings, updateOperationalSettings } from "@/server/actions/settings";
import { generateEndOfDayReport } from "@/server/actions/eod";
import { saveAiDashboardTemplate } from "@/server/actions/ai-dashboards";
import { submitAiMessageFeedback } from "@/server/actions/ai-feedback";

// ── Menu actions ──

describe("Action — createCategory", () => {
  it("creates a category and returns id", async () => {
    const result = await createCategory(MOCK_ORG_ID, { name: "Đồ ăn vặt", sortOrder: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects empty name", async () => {
    const result = await createCategory(MOCK_ORG_ID, { name: "", sortOrder: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("Action — createProduct", () => {
  it("creates a product and returns id", async () => {
    const input = {
      name: "Bánh tráng nướng",
      code: "BTN001",
      menuType: "food" as const,
      productType: "regular" as const,
      costPrice: 8000,
      salePrice: 25000,
      unit: "phần",
      isActive: true,
    };
    const result = await createProduct(MOCK_ORG_ID, input);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("Action — toggleProductActive", () => {
  it("toggles product active status", async () => {
    const productId = MOCK_PRODUCTS[0].id;
    const result = await toggleProductActive(MOCK_ORG_ID, productId, false);
    expect(result.ok).toBe(true);
  });
});

// ── Tables actions ──

describe("Action — createArea", () => {
  it("creates an area and returns id", async () => {
    const result = await createArea(MOCK_ORG_ID, MOCK_BRANCH_ID, { name: "Sân vườn", sortOrder: 5 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("Action — createTable", () => {
  it("creates a table and returns id", async () => {
    const result = await createTable(MOCK_ORG_ID, {
      branchId: MOCK_BRANCH_ID,
      name: "Bàn mới",
      seats: 4,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects duplicate table name", async () => {
    const existingName = MOCK_TABLES[0].name;
    const result = await createTable(MOCK_ORG_ID, {
      branchId: MOCK_BRANCH_ID,
      name: existingName,
      seats: 2,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("CONFLICT");
  });
});

describe("Action — updateTableStatus", () => {
  it("updates table status", async () => {
    const tableId = MOCK_TABLES[0].id;
    const result = await updateTableStatus(MOCK_ORG_ID, {
      tableId,
      status: "occupied" as const,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.status).toBe("occupied");
  });

  it("rejects invalid status", async () => {
    const tableId = MOCK_TABLES[0].id;
    const result = await updateTableStatus(MOCK_ORG_ID, {
      tableId,
      status: "invalid_status" as any,
    });
    expect(result.ok).toBe(false);
  });
});

// ── Inventory actions ──

describe("Action — createInventoryItem", () => {
  it("creates an inventory item and returns id", async () => {
    const result = await createInventoryItem(MOCK_ORG_ID, MOCK_BRANCH_ID, {
      name: "Đường phèn",
      code: "DP001",
      itemType: "ingredient" as const,
      unit: "kg",
      costPrice: 25000,
      initialQuantity: 10,
      lowStockThreshold: 2,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("Action — createInventoryMovement", () => {
  it("creates a purchase movement", async () => {
    const itemId = MOCK_INVENTORY_ITEMS[0].id;
    const result = await createInventoryMovement(MOCK_ORG_ID, {
      branchId: MOCK_BRANCH_ID,
      inventoryItemId: itemId,
      movementType: "purchase" as const,
      quantityDelta: 5,
      unitCost: 30000,
      note: "Nhập kho test",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

// ── Settings actions ──

describe("Action — updateInventorySettings", () => {
  it("saves inventory settings", async () => {
    const result = await updateInventorySettings(MOCK_ORG_ID, {
      allowNegativeInventory: true,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.allowNegativeInventory).toBe(true);
  });
});

describe("Action — updateOperationalSettings", () => {
  it("saves operational settings", async () => {
    const input = {
      allowNegativeInventory: false,
      inventoryDeductionTiming: "payment" as const,
      lowStockAlertEnabled: true,
      defaultLowStockThreshold: 5,
      defaultOrderType: "dine_in" as const,
      defaultTakeawayChannelId: null,
      allowUnpaidOrders: false,
      discountsEnabled: true,
      maxDiscountPercent: 30,
      defaultPaymentMethod: "cash" as const,
      kitchenSoundEnabled: true,
      autoSendToKitchenOnPayment: false,
      showRegularItemsInKitchen: true,
      autoMarkServedOnReady: false,
      businessDayStartTime: "06:00",
      includeServiceFeeInRevenue: false,
      autoGenerateEod: false,
      receiptStoreName: null,
      receiptAddress: null,
      receiptPhone: null,
      receiptLogoUrl: null,
      receiptFooter: "Cảm ơn quý khách.",
      bankCode: null,
      bankAccountNumber: null,
      salesChannels: [],
    };
    const result = await updateOperationalSettings(MOCK_ORG_ID, input);
    expect(result.ok).toBe(true);
  });
});

// ── EOD ──

describe("Action — generateEndOfDayReport", () => {
  it("generates an EOD report", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const result = await generateEndOfDayReport(MOCK_ORG_ID, {
      branchId: MOCK_BRANCH_ID,
      reportDate: today,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.totalOrders).toBeGreaterThanOrEqual(0);
      expect(result.data.reportDate).toBe(today);
    }
  });
});

// ── AI Dashboard ──

describe("Action — saveAiDashboardTemplate", () => {
  it("saves a dashboard template", async () => {
    const result = await saveAiDashboardTemplate(MOCK_ORG_ID, {
      name: "Doanh thu hôm nay",
      prompt: "Tổng hợp doanh thu",
      spec: {
        title: "Doanh thu",
        layout: "grid",
        filters: [],
        cards: [],
        charts: [],
        tables: [],
        insights: [],
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.id).toMatch(/^[0-9a-f-]{36}$/);
  });
});

// ── AI Feedback ──

describe("Action — submitAiMessageFeedback", () => {
  it("returns error when message does not exist", async () => {
    const result = await submitAiMessageFeedback(MOCK_ORG_ID, {
      messageId: "00000000-0000-0000-0000-000000000000",
      rating: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("NOT_FOUND");
  });
});

// ── Permission denial ──

describe("Action — permission denial", () => {
  it("redirects to /onboarding when org has no membership", async () => {
    const fakeOrgId = "00000000-0000-0000-0000-000000000000";
    await expect(
      createCategory(fakeOrgId, { name: "Test", sortOrder: 0 })
    ).rejects.toThrow(RedirectError);
  });
});
