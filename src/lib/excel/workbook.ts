import "server-only";
import ExcelJS from "exceljs";

export const EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface ParsedSheet<T> {
  sheetName: string;
  rows: T[];
  rowNumbers: number[];
}

export async function readWorkbook(buffer: ArrayBuffer | Uint8Array): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  const data = Buffer.from(buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer));
  await wb.xlsx.load(data as unknown as ArrayBuffer);
  return wb;
}

export function sheetToRows<T>(
  sheet: ExcelJS.Worksheet,
  columnMap: Record<string, string>,
  parse: (values: Record<string, unknown>, rowNumber: number) => T | null
): ParsedSheet<T> {
  const headerLookup = new Map<string, string>();
  for (const [field, header] of Object.entries(columnMap)) {
    headerLookup.set(header.trim().toLowerCase(), field);
  }

  const rows: T[] = [];
  const rowNumbers: number[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values: Record<string, unknown> = {};
    for (const field of Object.values(columnMap)) values[field] = "";
    let anyValue = false;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const headerCell = sheet.getRow(1).getCell(colNumber).value;
      if (headerCell == null) return;
      const headerText = String(headerCell).trim();
      if (!headerText) return;
      const field = headerLookup.get(headerText.toLowerCase());
      if (!field) return;
      const v = cellValue(cell);
      values[field] = v;
      if (v !== null && v !== "") anyValue = true;
    });
    if (!anyValue) return;
    const parsed = parse(values, rowNumber);
    if (parsed == null) return;
    rows.push(parsed);
    rowNumbers.push(rowNumber);
  });
  return { sheetName: sheet.name, rows, rowNumbers };
}

function cellValue(cell: ExcelJS.Cell): unknown {
  if (cell.type === ExcelJS.ValueType.Formula) {
    const r = cell.result as { result?: unknown } | unknown;
    if (r && typeof r === "object" && r !== null && "result" in (r as Record<string, unknown>)) {
      return (r as { result: unknown }).result ?? null;
    }
    return r ?? null;
  }
  if (cell.type === ExcelJS.ValueType.Date) return cell.value ?? null;
  if (cell.type === ExcelJS.ValueType.Hyperlink) {
    const v = cell.value as { text?: unknown; hyperlink?: unknown } | string | null;
    if (v && typeof v === "object") return v.text ?? v.hyperlink ?? null;
    return v ?? null;
  }
  if (cell.type === ExcelJS.ValueType.RichText) {
    const v = cell.value as { richText?: Array<{ text: string }> } | string | null;
    if (v && typeof v === "object" && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text).join("");
    }
    return v ?? null;
  }
  return cell.value ?? null;
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim().replace(/\s+/g, "").replace(/,/g, ".");
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function toInt(value: unknown): number | null {
  const n = toNumber(value);
  if (n === null) return null;
  return Math.trunc(n);
}

export function toBool(value: unknown): boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "co", "có"].includes(v)) return true;
    if (["false", "0", "no", "n", "khong", "không"].includes(v)) return false;
  }
  return null;
}

export async function workbookToBuffer(wb: ExcelJS.Workbook): Promise<Buffer> {
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}


