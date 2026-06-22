import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { previewProducts, previewInventoryItems, previewInventoryMovements } from "@/server/excel/imports";
import { buildProductTemplate, buildInventoryItemTemplate, buildInventoryMovementTemplate } from "@/server/excel/templates";
import { productImportRowSchema, inventoryItemImportRowSchema, inventoryMovementImportRowSchema } from "@/lib/validation/excel-schemas";

/**
 * Build a workbook in memory, then drive the same preview pipeline the
 * server actions use. This gives us end-to-end coverage of the parser
 * without booting Next.js or Supabase.
 *
 * Column headers are kept ASCII in the templates to avoid the
 * historical ExcelJS ban on certain Unicode characters in worksheet
 * names, and to keep tests platform-independent.
 */

async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

const PRODUCT_HEADERS = [
  "Mã món",
  "Tên món",
  "Nhóm món",
  "Loại thực đơn (food|drink|service|other)",
  "Loại sản phẩm (regular|prepared)",
  "Giá vốn (đ)",
  "Giá bán (đ)",
  "Đơn vị",
  "Mô tả",
  "Ảnh (URL)",
  "Đang bán (true|false)",
];

const INVENTORY_HEADERS = [
  "Mã hàng",
  "Tên hàng",
  "Loại (ingredient|sellable_product|packaging|other)",
  "Đơn vị",
  "Giá vốn (đ)",
  "Mô tả",
  "Ảnh (URL)",
  "Số lượng",
  "Định mức thấp",
];

const MOVEMENT_HEADERS = [
  "Mã hàng",
  "Loại phiếu (purchase|adjustment|waste|return|transfer_in|transfer_out)",
  "Chiều (in|out|+|-)",
  "Số lượng",
  "Đơn giá (đ)",
  "Ghi chú",
  "Ngày (YYYY-MM-DD)",
];

const PRODUCT_KEYS = [
  "code",
  "name",
  "category",
  "menuType",
  "productType",
  "costPrice",
  "salePrice",
  "unit",
  "description",
  "imageUrl",
  "isActive",
];

const INVENTORY_KEYS = [
  "code",
  "name",
  "itemType",
  "unit",
  "costPrice",
  "description",
  "imageUrl",
  "initialQuantity",
  "lowStockThreshold",
];

const MOVEMENT_KEYS = [
  "itemCode",
  "movementType",
  "direction",
  "quantity",
  "unitCost",
  "note",
  "movementDate",
];

function buildSheet(wb: ExcelJS.Workbook, name: string, headers: string[], keys: string[], rows: Array<Record<string, unknown>>) {
  const sheet = wb.addWorksheet(name);
  sheet.addRow(headers);
  const rows2 = sheet.getRow(1);
  for (let i = 0; i < headers.length; i++) {
    rows2.getCell(i + 1).font = { bold: true };
  }
  rows2.commit();
  for (const r of rows) {
    const out: unknown[] = [];
    for (const k of keys) {
      out.push(r[k] ?? "");
    }
    sheet.addRow(out);
  }
  return sheet;
}

describe("excel product import", () => {
  it("previews a valid product file", async () => {
    const wb = new ExcelJS.Workbook();
    buildSheet(wb, "Products", PRODUCT_HEADERS, PRODUCT_KEYS, [
      {
        code: "CF-001",
        name: "Ca phe sua da",
        category: "Do uong",
        menuType: "drink",
        productType: "regular",
        costPrice: 8000,
        salePrice: 25000,
        unit: "ly",
        description: "Ca phe truyen thong",
        imageUrl: "",
        isActive: true,
      },
      {
        code: "PH-002",
        name: "Pho bo",
        category: "Do an",
        menuType: "food",
        productType: "prepared",
        costPrice: 30000,
        salePrice: 55000,
        unit: "to",
        description: "",
        imageUrl: "",
        isActive: true,
      },
    ]);
    const buf = await workbookToBuffer(wb);
    const preview = await previewProducts(buf, "products.xlsx");
    expect(preview.errorCount).toBe(0);
    expect(preview.validCount).toBe(2);
    expect(preview.cleaned[0].data.code).toBe("CF-001");
    expect(preview.cleaned[0].data.menuType).toBe("drink");
    expect(preview.cleaned[1].data.productType).toBe("prepared");
  });

  it("flags row-level errors with field-level messages", async () => {
    const wb = new ExcelJS.Workbook();
    buildSheet(wb, "Products", PRODUCT_HEADERS, PRODUCT_KEYS, [
      {
        code: "",
        name: "Khong co ma",
        category: "Do uong",
        menuType: "drink",
        productType: "regular",
        costPrice: -5,
        salePrice: 25000,
        unit: "ly",
        description: "",
        imageUrl: "not-a-url",
        isActive: true,
      },
    ]);
    const buf = await workbookToBuffer(wb);
    const preview = await previewProducts(buf, "bad.xlsx");
    expect(preview.errorCount).toBe(1);
    expect(preview.errors[0].rowNumber).toBe(2);
    const fields = preview.errors[0].issues.map((i) => i.column);
    expect(fields).toContain("Mã món");
    expect(fields).toContain("Giá vốn (đ)");
    expect(fields).toContain("Ảnh (URL)");
  });

  it("ignores empty rows and reads boolean as text", async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet("Products");
    sheet.addRow(PRODUCT_HEADERS);
    sheet.getRow(1).font = { bold: true };
    // empty row
    sheet.addRow(new Array(PRODUCT_HEADERS.length).fill(""));
    // real row
    sheet.addRow(
      PRODUCT_KEYS.map((k) =>
        k === "code" ? "X-1" : k === "name" ? "Mon 1" : k === "menuType" ? "food" : k === "productType" ? "regular" : k === "costPrice" ? 1000 : k === "salePrice" ? 2000 : k === "unit" ? "phan" : k === "isActive" ? "false" : ""
      )
    );
    const buf = await workbookToBuffer(wb);
    const preview = await previewProducts(buf, "mixed.xlsx");
    expect(preview.validCount).toBe(1);
    expect(preview.errorCount).toBe(0);
    expect(preview.cleaned[0].data.isActive).toBe(false);
  });

  it("builds a downloadable template", async () => {
    const buf = await buildProductTemplate();
    expect(buf.length).toBeGreaterThan(0);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet("Products");
    expect(sheet).toBeTruthy();
    expect(sheet!.getRow(1).getCell(1).value).toBe("Mã món");
  });

  it("exposes the same zod shape used for commit validation", () => {
    const valid = productImportRowSchema.safeParse({
      code: "ABC",
      name: "Ten",
      category: null,
      menuType: "food",
      productType: "regular",
      costPrice: 0,
      salePrice: 0,
      unit: "phan",
      description: null,
      imageUrl: null,
      isActive: true,
    });
    expect(valid.success).toBe(true);
  });
});

describe("excel inventory import", () => {
  it("previews a valid inventory item file", async () => {
    const wb = new ExcelJS.Workbook();
    buildSheet(wb, "Inventory", INVENTORY_HEADERS, INVENTORY_KEYS, [
      {
        code: "NL-001",
        name: "Ca phe hat",
        itemType: "ingredient",
        unit: "g",
        costPrice: 200,
        description: "",
        imageUrl: "",
        initialQuantity: 5000,
        lowStockThreshold: 1000,
      },
    ]);
    const buf = await workbookToBuffer(wb);
    const preview = await previewInventoryItems(buf, "inv.xlsx");
    expect(preview.errorCount).toBe(0);
    expect(preview.validCount).toBe(1);
    expect(preview.cleaned[0].data.itemType).toBe("ingredient");
    expect(preview.cleaned[0].data.initialQuantity).toBe(5000);
  });

  it("builds a downloadable inventory item template", async () => {
    const buf = await buildInventoryItemTemplate();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet("Inventory");
    expect(sheet).toBeTruthy();
    expect(sheet!.getRow(1).getCell(1).value).toBe("Mã hàng");
  });

  it("inventory item zod rejects bad item type", () => {
    const r = inventoryItemImportRowSchema.safeParse({
      code: "X",
      name: "Y",
      itemType: "junk",
      unit: "g",
      costPrice: 1,
      description: null,
      imageUrl: null,
      initialQuantity: 0,
      lowStockThreshold: 0,
    });
    expect(r.success).toBe(false);
  });
});

describe("excel inventory movement import", () => {
  it("previews a valid movement file with mixed directions", async () => {
    const wb = new ExcelJS.Workbook();
    buildSheet(wb, "Movements", MOVEMENT_HEADERS, MOVEMENT_KEYS, [
      {
        itemCode: "NL-001",
        movementType: "purchase",
        direction: "in",
        quantity: 1000,
        unitCost: 200,
        note: "Nhap thang 6",
        movementDate: "2026-06-20",
      },
      {
        itemCode: "NL-001",
        movementType: "waste",
        direction: "-",
        quantity: 50,
        unitCost: 0,
        note: "hao hut",
        movementDate: "",
      },
    ]);
    const buf = await workbookToBuffer(wb);
    const preview = await previewInventoryMovements(buf, "mv.xlsx");
    expect(preview.errorCount).toBe(0);
    expect(preview.validCount).toBe(2);
    expect(preview.cleaned[0].data.movementType).toBe("purchase");
    expect(preview.cleaned[1].data.direction).toBe("-");
  });

  it("rejects zero quantity and bad movement type", () => {
    const a = inventoryMovementImportRowSchema.safeParse({
      itemCode: "NL-001",
      movementType: "purchase",
      direction: "in",
      quantity: 0,
      unitCost: 0,
      note: null,
      movementDate: null,
    });
    expect(a.success).toBe(false);
    const b = inventoryMovementImportRowSchema.safeParse({
      itemCode: "NL-001",
      movementType: "weird",
      direction: "in",
      quantity: 5,
      unitCost: 0,
      note: null,
      movementDate: null,
    });
    expect(b.success).toBe(false);
  });

  it("builds a downloadable movement template", async () => {
    const buf = await buildInventoryMovementTemplate();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const sheet = wb.getWorksheet("Movements");
    expect(sheet).toBeTruthy();
    expect(sheet!.getRow(1).getCell(1).value).toBe("Mã hàng");
  });
});


