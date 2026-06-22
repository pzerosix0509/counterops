import { z } from "zod";

/**
 * Row-level Zod schemas used by the Excel import pipeline.
 * Accepts loose inputs (strings, booleans as text) because Excel
 * cells come in as raw text/numbers. The commit step drops the
 * result straight into the existing production schemas.
 *
 * Column headers use Vietnamese with diacritics for a friendly display.
 * Sheet names stay ASCII to keep templates portable across Excel builds
 * that historically reject certain Unicode characters in worksheet names.
 */

const emptyToNull = (v: unknown) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "string" && v.trim() === "") return null;
  return v;
};

const stringToNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const trimmed = v.trim().replace(/\s+/g, "").replace(/,/g, ".");
    if (!trimmed) return null;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : null;
  }
  return null;
};

const stringToInt = (v: unknown): number | null => {
  const n = stringToNumber(v);
  return n === null ? null : Math.trunc(n);
};

const stringToBool = (v: unknown): boolean | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["true", "1", "yes", "y", "co", "có"].includes(s)) return true;
    if (["false", "0", "no", "n", "khong", "không"].includes(s)) return false;
  }
  return null;
};

const cellString = z.preprocess(emptyToNull, z.string().max(2000).nullable().optional().transform((v) => (v == null ? "" : v)));

const cellOptionalString = z.preprocess(emptyToNull, z.string().max(2000).nullable());

const cellInt = (opts: { min?: number; defaultValue?: number | null; required?: boolean } = {}) => {
  const { min, defaultValue, required } = opts;
  let s = z.preprocess(stringToInt, z.number().int().nullable());
  if (typeof min === "number") s = s.refine((v) => v === null || v >= min, { message: "Giá trị tối thiểu " + min });
  return s.transform((v) => {
    if (v === null) {
      if (required) return null;
      return defaultValue ?? null;
    }
    return v;
  });
};

const cellNumber = (opts: { min?: number; required?: boolean; defaultValue?: number | null } = {}) => {
  const { min, required, defaultValue } = opts;
  let s = z.preprocess(stringToNumber, z.number().nullable());
  if (typeof min === "number") s = s.refine((v) => v === null || v >= min, { message: "Giá trị tối thiểu " + min });
  return s.transform((v) => {
    if (v === null) {
      if (required) return null;
      return defaultValue ?? null;
    }
    return v;
  });
};

const cellBool = z.preprocess(
  (v) => (v === null || v === undefined || v === "" ? true : stringToBool(v)),
  z.boolean()
);

const cellDate = z.preprocess((v) => {
  if (v === null || v === undefined || v === "") return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number") {
    const ms = (v - 25569) * 86400 * 1000;
    const d = new Date(ms);
    return Number.isFinite(d.valueOf()) ? d.toISOString().slice(0, 10) : null;
  }
  if (typeof v === "string") {
    const s = v.trim();
    if (!s) return null;
    const d = new Date(s);
    return Number.isFinite(d.valueOf()) ? d.toISOString().slice(0, 10) : null;
  }
  return null;
}, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable());

// --- Menu product import -------------------------------------------

export const MENU_TYPE_VALUES = ["food", "drink", "service", "other"] as const;
export const PRODUCT_TYPE_VALUES = ["regular", "prepared"] as const;

export const productImportRowSchema = z.object({
  code: cellString.refine((v) => v.length > 0, "Mã món không được trống"),
  name: cellString.refine((v) => v.length > 0, "Tên món không được trống"),
  category: cellOptionalString,
  menuType: z.preprocess(
    (v) => (v == null ? "" : String(v).trim().toLowerCase()),
    z.enum(MENU_TYPE_VALUES, { message: "Loại thực đơn không hợp lệ" })
  ),
  productType: z.preprocess(
    (v) => (v == null ? "" : String(v).trim().toLowerCase()),
    z.enum(PRODUCT_TYPE_VALUES, { message: "Loại sản phẩm không hợp lệ" })
  ),
  costPrice: cellInt({ min: 0, defaultValue: 0, required: true }).refine((v) => v !== null, "Giá vốn phải là số nguyên"),
  salePrice: cellInt({ min: 0, defaultValue: 0, required: true }).refine((v) => v !== null, "Giá bán phải là số nguyên"),
  unit: cellString.refine((v) => v.length > 0, "Đơn vị không được trống"),
  description: cellOptionalString,
  imageUrl: cellOptionalString
    .refine((v) => v === null || v === "" || /^https?:\/\//i.test(v), "URL ảnh không hợp lệ")
    .transform((v) => (v == null || v === "" ? null : v)),
  isActive: cellBool,
});
export type ProductImportRow = z.infer<typeof productImportRowSchema>;

export const PRODUCT_IMPORT_COLUMNS = [
  { key: "code", header: "Mã món" },
  { key: "name", header: "Tên món" },
  { key: "category", header: "Nhóm món" },
  { key: "menuType", header: "Loại thực đơn (food|drink|service|other)" },
  { key: "productType", header: "Loại sản phẩm (regular|prepared)" },
  { key: "costPrice", header: "Giá vốn (đ)" },
  { key: "salePrice", header: "Giá bán (đ)" },
  { key: "unit", header: "Đơn vị" },
  { key: "description", header: "Mô tả" },
  { key: "imageUrl", header: "Ảnh (URL)" },
  { key: "isActive", header: "Đang bán (true|false)" },
] as const;

export const PRODUCT_COLUMN_BY_FIELD: Record<string, string> = Object.fromEntries(
  PRODUCT_IMPORT_COLUMNS.map((c) => [c.key, c.header])
);

// --- Inventory item import -----------------------------------------

export const INVENTORY_TYPE_VALUES = ["ingredient", "sellable_product", "packaging", "other"] as const;

export const inventoryItemImportRowSchema = z.object({
  code: cellString.refine((v) => v.length > 0, "Mã hàng không được trống"),
  name: cellString.refine((v) => v.length > 0, "Tên hàng không được trống"),
  itemType: z.preprocess(
    (v) => (v == null ? "" : String(v).trim().toLowerCase()),
    z.enum(INVENTORY_TYPE_VALUES, { message: "Loại hàng không hợp lệ" })
  ),
  unit: cellString.refine((v) => v.length > 0, "Đơn vị không được trống"),
  costPrice: cellInt({ min: 0, defaultValue: 0, required: true }).refine((v) => v !== null, "Giá vốn phải là số nguyên"),
  description: cellOptionalString,
  imageUrl: cellOptionalString
    .refine((v) => v === null || v === "" || /^https?:\/\//i.test(v), "URL ảnh không hợp lệ")
    .transform((v) => (v == null || v === "" ? null : v)),
  initialQuantity: cellNumber({ min: 0, defaultValue: 0 }),
  lowStockThreshold: cellNumber({ min: 0, defaultValue: 0 }),
});
export type InventoryItemImportRow = z.infer<typeof inventoryItemImportRowSchema>;

export const INVENTORY_ITEM_IMPORT_COLUMNS = [
  { key: "code", header: "Mã hàng" },
  { key: "name", header: "Tên hàng" },
  { key: "itemType", header: "Loại (ingredient|sellable_product|packaging|other)" },
  { key: "unit", header: "Đơn vị" },
  { key: "costPrice", header: "Giá vốn (đ)" },
  { key: "description", header: "Mô tả" },
  { key: "imageUrl", header: "Ảnh (URL)" },
  { key: "initialQuantity", header: "Số lượng" },
  { key: "lowStockThreshold", header: "Định mức thấp" },
] as const;

export const INVENTORY_ITEM_COLUMN_BY_FIELD: Record<string, string> = Object.fromEntries(
  INVENTORY_ITEM_IMPORT_COLUMNS.map((c) => [c.key, c.header])
);

// --- Inventory movement import -------------------------------------

export const MOVEMENT_TYPE_VALUES = [
  "purchase",
  "adjustment",
  "waste",
  "return",
  "transfer_in",
  "transfer_out",
] as const;

export const inventoryMovementImportRowSchema = z.object({
  itemCode: cellString.refine((v) => v.length > 0, "Mã hàng không được trống"),
  movementType: z.preprocess(
    (v) => (v == null ? "" : String(v).trim().toLowerCase()),
    z.enum(MOVEMENT_TYPE_VALUES, { message: "Loại phiếu không hợp lệ" })
  ),
  direction: z.preprocess(
    (v) => (v == null ? "" : String(v).trim().toLowerCase()),
    z.enum(["in", "out", "increase", "decrease", "+", "-"], { message: "Chiều tăng/giảm không hợp lệ" })
  ),
  quantity: cellNumber({ min: 0, required: true })
    .refine((v) => v !== null, "Số lượng phải là số")
    .refine((v) => v !== null && v > 0, "Số lượng phải lớn hơn 0"),
  unitCost: cellInt({ min: 0, defaultValue: 0 }),
  note: cellOptionalString,
  movementDate: cellDate,
});
export type InventoryMovementImportRow = z.infer<typeof inventoryMovementImportRowSchema>;

export const INVENTORY_MOVEMENT_IMPORT_COLUMNS = [
  { key: "itemCode", header: "Mã hàng" },
  { key: "movementType", header: "Loại phiếu (purchase|adjustment|waste|return|transfer_in|transfer_out)" },
  { key: "direction", header: "Chiều (in|out|+|-)" },
  { key: "quantity", header: "Số lượng" },
  { key: "unitCost", header: "Đơn giá (đ)" },
  { key: "note", header: "Ghi chú" },
  { key: "movementDate", header: "Ngày (YYYY-MM-DD)" },
] as const;

export const INVENTORY_MOVEMENT_COLUMN_BY_FIELD: Record<string, string> = Object.fromEntries(
  INVENTORY_MOVEMENT_IMPORT_COLUMNS.map((c) => [c.key, c.header])
);




