import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { buildMenuExport, buildInventoryExport, buildEodExport } from "@/server/excel/exports";
import { buildProductTemplate, buildInventoryItemTemplate, buildInventoryMovementTemplate } from "@/server/excel/templates";
import type { Product, InventoryItem, InventoryBalance, EndOfDayReport } from "@/types/database";
import type { EodComputation } from "@/server/queries/eod";

async function load(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb;
}

describe("excel exports", () => {
  it("builds a menu export with categories sheet", async () => {
    const categories = [
      { id: "c1", name: "Đồ uống" },
      { id: "c2", name: "Đồ ăn" },
    ];
    const products: Product[] = [
      {
        id: "p1",
        organization_id: "o",
        category_id: "c1",
        name: "Cà phê sữa",
        code: "CF-001",
        image_url: null,
        description: null,
        menu_type: "drink",
        product_type: "regular",
        cost_price: 8000,
        sale_price: 25000,
        unit: "ly",
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        deleted_at: null,
      },
    ];
    const buf = await buildMenuExport({ categories, products });
    const wb = await load(buf);
    const sheet = wb.getWorksheet("Menu");
    expect(sheet).toBeTruthy();
    const headers = sheet!.getRow(1).values as string[];
    expect(headers).toContain("Mã món");
    expect(headers).toContain("Giá bán");
    const row = sheet!.getRow(2);
    expect(row.getCell(1).value).toBe("CF-001");
    expect(row.getCell(3).value).toBe("Đồ uống");
  });

  it("builds an inventory export with status column", async () => {
    const items: InventoryItem[] = [
      {
        id: "i1",
        organization_id: "o",
        name: "Cà phê hạt",
        code: "NL-001",
        image_url: null,
        item_type: "ingredient",
        unit: "g",
        cost_price: 200,
        description: null,
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        deleted_at: null,
      },
    ];
    const balances: InventoryBalance[] = [
      {
        id: "b1",
        organization_id: "o",
        branch_id: "br",
        inventory_item_id: "i1",
        quantity_on_hand: 50,
        low_stock_threshold: 100,
        high_stock_threshold: null,
        updated_at: "2026-01-01T00:00:00Z",
      },
    ];
    const buf = await buildInventoryExport({ items, balances });
    const wb = await load(buf);
    const sheet = wb.getWorksheet("Inventory");
    expect(sheet).toBeTruthy();
    const row = sheet!.getRow(2);
    expect(row.getCell(1).value).toBe("NL-001");
    expect(row.getCell(9).value).toBe("Sắp hết");
  });

  it("builds an end-of-day export with summary and order detail", async () => {
    const data: EodComputation = {
      totalOrders: 2,
      grossSales: 100000,
      discounts: 0,
      netRevenue: 100000,
      costOfGoods: 40000,
      grossProfit: 60000,
      grossMarginPercent: 60,
      channelFees: 5000,
      netProfit: 55000,
      tax: 0,
      serviceFee: 0,
      totalPaid: 100000,
      debtAmount: 0,
      cashTotal: 60000,
      bankTransferTotal: 40000,
      cardTotal: 0,
      ewalletTotal: 0,
      debtPayments: 0,
      otherPayments: 0,
      cancelledOrders: 0,
      cancelledAmount: 0,
      orders: [
        {
          id: "o1",
          orderNumber: "DH-1",
          tableName: "Bàn 1",
          openedAt: "2026-06-20T08:00:00Z",
          closedAt: "2026-06-20T09:00:00Z",
          total: 50000,
          costOfGoods: 20000,
          grossProfit: 30000,
          channelFee: 2500,
          netProfit: 27500,
          payments: [{ method: "cash", amount: 50000 }],
        },
        {
          id: "o2",
          orderNumber: "DH-2",
          tableName: null,
          openedAt: "2026-06-20T10:00:00Z",
          closedAt: "2026-06-20T11:00:00Z",
          total: 50000,
          costOfGoods: 20000,
          grossProfit: 30000,
          channelFee: 2500,
          netProfit: 27500,
          payments: [{ method: "bank_transfer", amount: 50000 }],
        },
      ],
    };
    const savedReport: EndOfDayReport | null = {
      id: "r1",
      organization_id: "o",
      branch_id: "br",
      report_date: "2026-06-20",
      document_code: "EOD-X-20260620",
      total_orders: 2,
      gross_sales: 100000,
      discounts: 0,
      net_revenue: 100000,
      other_income: 0,
      tax: 0,
      return_fee: 0,
      total_paid: 100000,
      debt_amount: 0,
      cash_total: 60000,
      bank_transfer_total: 40000,
      generated_by: "u",
      generated_at: "2026-06-20T22:00:00Z",
    };
    const buf = await buildEodExport({
      branchName: "Chi nhánh 1",
      date: "2026-06-20",
      data,
      savedReport,
    });
    const wb = await load(buf);
    const summary = wb.getWorksheet("Summary");
    expect(summary).toBeTruthy();
    const orders = wb.getWorksheet("Paid Orders");
    expect(orders).toBeTruthy();
    expect(orders!.rowCount).toBeGreaterThanOrEqual(3);
  });

  it("templates load back as valid xlsx workbooks", async () => {
    const t1 = await load(await buildProductTemplate());
    expect(t1.getWorksheet("Products")).toBeTruthy();
    const t2 = await load(await buildInventoryItemTemplate());
    expect(t2.getWorksheet("Inventory")).toBeTruthy();
    const t3 = await load(await buildInventoryMovementTemplate());
    expect(t3.getWorksheet("Movements")).toBeTruthy();
  });
});




