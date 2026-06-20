import "server-only";
import ExcelJS from "exceljs";
import { formatVND } from "@/lib/date/ranges";
import { workbookToBuffer } from "@/lib/excel/workbook";
import type {
  EndOfDayReport,
  InventoryItem,
  InventoryBalance,
  Product,
} from "@/types/database";
import type { EodComputation } from "@/server/queries/eod";

// ASCII sheet names keep the exports portable across Excel builds
// that historically rejected certain Unicode characters.
const SHEET_MENU = "Menu";
const SHEET_CATEGORIES = "Categories";
const SHEET_INVENTORY = "Inventory";
const SHEET_EOD_SUMMARY = "Summary";
const SHEET_EOD_ORDERS = "Paid Orders";

function fillRow(row: ExcelJS.Row, values: unknown[], bold = false) {
  values.forEach((v, i) => {
    const cell = row.getCell(i + 1);
    cell.value = (v ?? "") as ExcelJS.CellValue;
    if (bold) cell.font = { bold: true };
  });
  row.commit();
}

export async function buildMenuExport(args: {
  categories: { id: string; name: string }[];
  products: Product[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Store Manager";
  wb.created = new Date();
  const sheet = wb.addWorksheet(SHEET_MENU);
  const headers = [
    "Mã món",
    "Tên món",
    "Nhóm món",
    "Loại thực đơn",
    "Loại sản phẩm",
    "Giá vốn",
    "Giá bán",
    "Đơn vị",
    "Đang bán",
    "Mô tả",
  ];
  fillRow(sheet.getRow(1), headers, true);
  const categoryName = new Map(args.categories.map((c) => [c.id, c.name]));
  args.products.forEach((p, i) => {
    fillRow(sheet.getRow(i + 2), [
      p.code,
      p.name,
      p.category_id ? categoryName.get(p.category_id) ?? "" : "",
      p.menu_type,
      p.product_type,
      p.cost_price,
      p.sale_price,
      p.unit,
      p.is_active ? "Đang bán" : "Ngừng bán",
      p.description ?? "",
    ]);
  });
  sheet.columns = headers.map((h) => ({ width: Math.max(h.length * 1.6, 14) }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  const categorySheet = wb.addWorksheet(SHEET_CATEGORIES);
  fillRow(categorySheet.getRow(1), ["Tên nhóm", "Số món"], true);
  const productCount = new Map<string, number>();
  for (const p of args.products) {
    if (!p.category_id) continue;
    productCount.set(p.category_id, (productCount.get(p.category_id) ?? 0) + 1);
  }
  let row = 2;
  for (const c of args.categories) {
    fillRow(categorySheet.getRow(row++), [c.name, productCount.get(c.id) ?? 0]);
  }
  categorySheet.columns = [
    { width: 24 },
    { width: 12 },
  ];

  return workbookToBuffer(wb);
}


export async function buildInventoryExport(args: {
  items: InventoryItem[];
  balances: InventoryBalance[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Store Manager";
  wb.created = new Date();
  const sheet = wb.addWorksheet(SHEET_INVENTORY);
  const headers = [
    "Mã hàng",
    "Tên hàng",
    "Loai",
    "Đơn vị",
    "Giá vốn",
    "Tồn hiện tại",
    "Định mức thấp",
    "Định mức cao",
    "Trạng thái",
    "Mô tả",
  ];
  fillRow(sheet.getRow(1), headers, true);
  const balanceMap = new Map(args.balances.map((b) => [b.inventory_item_id, b]));
  args.items.forEach((it, i) => {
    const b = balanceMap.get(it.id);
    const qty = b ? Number(b.quantity_on_hand) : 0;
    const low = b ? Number(b.low_stock_threshold) : 0;
    const high = b ? (b.high_stock_threshold == null ? "" : Number(b.high_stock_threshold)) : "";
    let status = "On";
    if (qty < 0) status = "Âm kho";
    else if (qty === 0) status = "Hết hàng";
    else if (low > 0 && qty <= low) status = "Sắp hết";
    fillRow(sheet.getRow(i + 2), [
      it.code,
      it.name,
      it.item_type,
      it.unit,
      it.cost_price,
      qty,
      low,
      high,
      status,
      it.description ?? "",
    ]);
  });
  sheet.columns = headers.map((h) => ({ width: Math.max(h.length * 1.6, 14) }));
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return workbookToBuffer(wb);
}


export async function buildEodExport(args: {
  branchName: string;
  date: string;
  data: EodComputation;
  savedReport: EndOfDayReport | null;
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Store Manager";
  wb.created = new Date();

  const summary = wb.addWorksheet(SHEET_EOD_SUMMARY);
  const rows: Array<[string, string | number]> = [
    ["Chi nhánh", args.branchName],
    ["Ngày báo cáo", args.date],
    ["Mã chứng từ", args.savedReport?.document_code ?? "(chưa lưu)"],
  ];
  fillRow(summary.getRow(1), ["Trường", "Giá trị"], true);
  let r = 2;
  for (const [k, v] of rows) fillRow(summary.getRow(r++), [k, v]);
  fillRow(summary.getRow(r++), [] as unknown as [string, string]);
  fillRow(summary.getRow(r++), ["Chỉ tiêu", "Giá trị"], true);
  const metrics: Array<[string, number | string]> = [
    ["Tổng đơn đã thanh toán", args.data.totalOrders],
    ["Tổng tiền hàng", formatVND(args.data.grossSales)],
    ["Giảm giá", formatVND(args.data.discounts)],
    ["Thuế", formatVND(args.data.tax)],
    ["Phí dịch vụ", formatVND(args.data.serviceFee)],
    ["Doanh thu thuần", formatVND(args.data.netRevenue)],
    ["Tổng thanh toán", formatVND(args.data.totalPaid)],
    ["Tiền mặt", formatVND(args.data.cashTotal)],
    ["Chuyển khoản", formatVND(args.data.bankTransferTotal)],
    ["Thẻ", formatVND(args.data.cardTotal)],
    ["Ví điện tử", formatVND(args.data.ewalletTotal)],
    ["Thanh toán ghi nợ", formatVND(args.data.debtPayments)],
    ["Thanh toán khác", formatVND(args.data.otherPayments)],
    ["Tổng ghi nợ", formatVND(args.data.debtAmount)],
    ["Đơn bị huỷ", args.data.cancelledOrders],
    ["Giá trị đơn huỷ", formatVND(args.data.cancelledAmount)],
  ];
  for (const [k, v] of metrics) fillRow(summary.getRow(r++), [k, v]);
  summary.columns = [{ width: 30 }, { width: 28 }];

  const orders = wb.addWorksheet(SHEET_EOD_ORDERS);
  const orderHeaders = [
    "Mã đơn",
    "Bàn",
    "Mở",
    "Đóng",
    "Tổng",
    "Tiền mặt",
    "Chuyển khoản",
    "Thẻ",
    "Ví điện tử",
    "Ghi nợ",
    "Khác",
  ];
  fillRow(orders.getRow(1), orderHeaders, true);
  args.data.orders.forEach((o, i) => {
    const byMethod = {
      cash: 0,
      bank_transfer: 0,
      card: 0,
      ewallet: 0,
      debt: 0,
      other: 0,
    } as Record<string, number>;
    for (const p of o.payments) {
      if (p.method in byMethod) byMethod[p.method] += p.amount;
      else byMethod.other += p.amount;
    }
    fillRow(orders.getRow(i + 2), [
      o.orderNumber,
      o.tableName ?? "Mang đi",
      o.openedAt,
      o.closedAt ?? "",
      o.total,
      byMethod.cash,
      byMethod.bank_transfer,
      byMethod.card,
      byMethod.ewallet,
      byMethod.debt,
      byMethod.other,
    ]);
  });
  orders.columns = orderHeaders.map((h) => ({ width: Math.max(h.length * 1.6, 14) }));
  orders.views = [{ state: "frozen", ySplit: 1 }];

  return workbookToBuffer(wb);
}


