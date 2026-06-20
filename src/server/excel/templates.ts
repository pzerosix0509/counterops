import "server-only";
import ExcelJS from "exceljs";
import {
  INVENTORY_ITEM_IMPORT_COLUMNS,
  INVENTORY_MOVEMENT_IMPORT_COLUMNS,
  INVENTORY_TYPE_VALUES,
  MENU_TYPE_VALUES,
  MOVEMENT_TYPE_VALUES,
  PRODUCT_IMPORT_COLUMNS,
  PRODUCT_TYPE_VALUES,
} from "@/lib/validation/excel-schemas";
import { workbookToBuffer } from "@/lib/excel/workbook";

/**
 * Build downloadable Excel templates for the three import flows. The
 * sheets are intentionally tiny so the user can see the column layout
 * before filling rows in.
 */

function addHeader(sheet: ExcelJS.Worksheet, columns: ReadonlyArray<{ key: string; header: string }>) {
  const row = sheet.getRow(1);
  columns.forEach((c, i) => {
    const cell = row.getCell(i + 1);
    cell.value = c.header;
    cell.font = { bold: true };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEEF2FF" },
    };
    cell.alignment = { vertical: "middle", horizontal: "left" };
  });
  row.commit();
  sheet.columns = columns.map((c) => ({
    header: c.header,
    key: c.key,
    width: Math.max(c.header.length * 1.6, 14),
  }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
}

function addInstructionsSheet(wb: ExcelJS.Workbook, lines: string[]) {
  // Worksheet names cannot contain * ? : \ / [ ], and historically some
  // Excel builds also reject non-ASCII characters. Use plain ASCII to be
  // safe.
  const sheet = wb.addWorksheet("Instructions");
  sheet.getColumn(1).width = 90;
  lines.forEach((line, i) => {
    const cell = sheet.getCell(i + 1, 1);
    cell.value = line;
    cell.alignment = { wrapText: true, vertical: "top" };
  });
}

export async function buildProductTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Store Manager";
  wb.created = new Date();
  const sheet = wb.addWorksheet("Products");
  addHeader(sheet, PRODUCT_IMPORT_COLUMNS);
  sheet.addRow({
    code: "CF-001",
    name: "Cà phê sữa đá",
    category: "Đồ uống",
    menuType: "drink",
    productType: "regular",
    costPrice: 8000,
    salePrice: 25000,
    unit: "ly",
    description: "Cà phê truyền thống",
    imageUrl: "",
    isActive: true,
  });
  addInstructionsSheet(wb, [
    "Import menu (Products).",
    "- One row per product. 'Mã món' (code) is the unique business key inside the organization.",
    "- If the code already exists, the system updates the existing product and preserves the existing category when the 'Nhóm món' column is blank.",
    "- 'Loại thực đơn' accepts: " + MENU_TYPE_VALUES.join(", ") + ".",
    "- 'Loại sản phẩm' accepts: " + PRODUCT_TYPE_VALUES.join(", ") + ".",
    "- 'Đang bán' accepts true/false, defaulting to true.",
    "- 'Nhóm món' matches case-insensitively; new categories are created on the fly.",
  ]);
  return workbookToBuffer(wb);
}

export async function buildInventoryItemTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Store Manager";
  wb.created = new Date();
  const sheet = wb.addWorksheet("Inventory");
  addHeader(sheet, INVENTORY_ITEM_IMPORT_COLUMNS);
  sheet.addRow({
    code: "NL-CAFE-001",
    name: "Cà phê hạt",
    itemType: "ingredient",
    unit: "g",
    costPrice: 200,
    description: "Cà phê Robusta",
    imageUrl: "",
    initialQuantity: 5000,
    lowStockThreshold: 1000,
  });
  addInstructionsSheet(wb, [
    "Import inventory items (Inventory).",
    "- 'Mã hàng' (code) is the unique business key. Existing items have their name, unit, and cost price updated.",
    "- 'Loai' accepts: " + INVENTORY_TYPE_VALUES.join(", ") + ".",
    "- 'Tồn đầu' and 'Định mức thấp' only apply when the item is new; existing items keep their current stock and threshold.",
  ]);
  return workbookToBuffer(wb);
}

export async function buildInventoryMovementTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Store Manager";
  wb.created = new Date();
  const sheet = wb.addWorksheet("Movements");
  addHeader(sheet, INVENTORY_MOVEMENT_IMPORT_COLUMNS);
  sheet.addRow({
    itemCode: "NL-CAFE-001",
    movementType: "purchase",
    direction: "in",
    quantity: 2000,
    unitCost: 210,
    note: "Nhập từ nhà cung cấp A",
    movementDate: new Date().toISOString().slice(0, 10),
  });
  addInstructionsSheet(wb, [
    "Import stock movements (Movements).",
    "- One row per stock movement. 'Mã hàng' must already exist inside the organization.",
    "- 'Loại phiếu' accepts: " + MOVEMENT_TYPE_VALUES.join(", ") + ".",
    "- 'Chiều' accepts: in / + / increase (positive) and out / - / decrease (negative).",
    "- If a negative movement would drop stock below zero and the organization has not enabled 'Cho phép âm kho', the row is rejected with a clear reason.",
    "- 'Ngày' (optional) defaults to today.",
  ]);
  return workbookToBuffer(wb);
}

