import "server-only";
import { z } from "zod";
import { readWorkbook, sheetToRows } from "@/lib/excel/workbook";
import { validateRows, type RowIssue, type ValidationReport } from "@/lib/validation/row";
import {
  INVENTORY_ITEM_COLUMN_BY_FIELD,
  INVENTORY_MOVEMENT_COLUMN_BY_FIELD,
  PRODUCT_COLUMN_BY_FIELD,
  inventoryItemImportRowSchema,
  inventoryMovementImportRowSchema,
  productImportRowSchema,
  type InventoryItemImportRow,
  type InventoryMovementImportRow,
  type ProductImportRow,
} from "@/lib/validation/excel-schemas";
import type { ActionResult } from "@/lib/utils/action-result";
import { actionFail, actionOk } from "@/lib/utils/action-result";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { revalidatePath } from "next/cache";

export interface ImportPreviewError {
  rowNumber: number;
  issues: RowIssue[];
}

export interface ImportPreview<T> {
  totalRows: number;
  validCount: number;
  errorCount: number;
  cleaned: Array<{ rowNumber: number; data: T }>;
  errors: ImportPreviewError[];
  commitToken: string;
  fileName: string;
}

function readSheetByName(wb: import("exceljs").Workbook, name: string) {
  const sheet = wb.worksheets.find((s) => s.name.toLowerCase() === name.toLowerCase());
  if (!sheet) {
    throw new Error(`Không tìm thấy sheet "${name}" trong tệp Excel.`);
  }
  return sheet;
}

async function parseToValidation<T extends Record<string, unknown>>(
  buffer: ArrayBuffer | Uint8Array,
  sheetName: string,
  schema: z.ZodType<T>,
  columnByField: Record<string, string>,
  fileName: string
): Promise<ValidationReport<T>> {
  const wb = await readWorkbook(buffer);
  const sheet = readSheetByName(wb, sheetName);
  const { rows, rowNumbers } = sheetToRows(sheet, columnByField, (values) => values as T);
  void fileName;
  const items = rows.map((r, i) => ({ rowNumber: rowNumbers[i], values: r as unknown as Record<string, unknown> }));
  return validateRows(items, schema, columnByField);
}

function tokenize(parts: Array<{ rowNumber: number; data: Record<string, unknown> }>): string {
  const payload = JSON.stringify(parts.map((p) => ({ rowNumber: p.rowNumber, data: p.data })));
  let h = 5381;
  for (let i = 0; i < payload.length; i++) {
    h = ((h << 5) + h) ^ payload.charCodeAt(i);
  }
  return `t${(h >>> 0).toString(16)}`;
}

export function buildPreview<T>(
  report: ValidationReport<T>,
  fileName: string
): ImportPreview<T> {
  return {
    totalRows: report.cleaned.length + report.errors.length,
    validCount: report.cleaned.length,
    errorCount: report.errors.length,
    cleaned: report.cleaned,
    errors: report.errors,
    commitToken: tokenize(
      report.cleaned.map((c) => ({ rowNumber: c.rowNumber, data: c.data as unknown as Record<string, unknown> }))
    ),
    fileName,
  };
}

/**
 * Re-validate a preview that came back from the client. We trust the
 * client up to the point of "user confirmed these rows"; we do not
 * trust the contents. This step restores the typed shape so the
 * commit functions can stay strict.
 */
function revalidatePreview<T extends Record<string, unknown>>(
  preview: ImportPreview<unknown>,
  schema: z.ZodType<T>
): ImportPreview<T> {
  const cleaned: Array<{ rowNumber: number; data: T }> = [];
  const errors: ImportPreviewError[] = preview.errors.map((e) => ({ ...e }));
  for (const row of preview.cleaned) {
    const parsed = schema.safeParse(row.data);
    if (parsed.success) {
      cleaned.push({ rowNumber: row.rowNumber, data: parsed.data });
    } else {
      const issues: RowIssue[] = parsed.error.issues.map((issue) => {
        const field = String(issue.path[0] ?? "");
        return {
          field,
          column: field,
          message: issue.message,
          code: issue.code,
        };
      });
      errors.push({ rowNumber: row.rowNumber, issues });
    }
  }
  return {
    totalRows: cleaned.length + errors.length,
    validCount: cleaned.length,
    errorCount: errors.length,
    cleaned,
    errors,
    commitToken: tokenize(cleaned.map((c) => ({ rowNumber: c.rowNumber, data: c.data as unknown as Record<string, unknown> }))),
    fileName: preview.fileName,
  };
}

// ---------------- Products preview / commit -----------------------

export async function previewProducts(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string
): Promise<ImportPreview<ProductImportRow>> {
  const report = await parseToValidation(
    buffer,
    "Products",
    productImportRowSchema,
    PRODUCT_COLUMN_BY_FIELD,
    fileName
  );
  return buildPreview(report, fileName);
}

export async function commitProducts(
  organizationId: string,
  userId: string,
  previewIn: ImportPreview<unknown>
): Promise<ActionResult<{ upserted: number; created: number; updated: number }>> {
  const preview = revalidatePreview(previewIn, productImportRowSchema);
  if (preview.cleaned.length === 0) {
    return actionFail("NO_ROWS", "Không có dòng hợp lệ để ghi.");
  }
  const admin = createSupabaseAdminClient();
  const codes = Array.from(new Set(preview.cleaned.map((c) => c.data.code)));
  const { data: existing } = await admin
    .from("products")
    .select("id, code, category_id")
    .eq("organization_id", organizationId)
    .in("code", codes);
  const existingByCode = new Map<string, { id: string; code: string; category_id: string | null }>(
    (existing ?? []).map((row) => [row.code as string, row as { id: string; code: string; category_id: string | null }])
  );

  const { data: categoryRows } = await admin
    .from("menu_categories")
    .select("id, name")
    .eq("organization_id", organizationId);
  const categoriesByName = new Map<string, { id: string; name: string }>();
  for (const c of categoryRows ?? []) {
    categoriesByName.set(c.name.trim().toLowerCase(), c as { id: string; name: string });
  }
  const desiredCategoryNames = Array.from(
    new Set(
      preview.cleaned
        .map((c) => c.data.category)
        .filter((v): v is string => Boolean(v && v.length > 0))
    )
  );
  for (const name of desiredCategoryNames) {
    if (categoriesByName.has(name.toLowerCase())) continue;
    const sortOrder = (categoryRows?.length ?? 0) + categoriesByName.size;
    const { data: created, error } = await admin
      .from("menu_categories")
      .insert({ organization_id: organizationId, name, sort_order: sortOrder })
      .select("id, name")
      .single();
    if (error || !created) {
      return actionFail("INTERNAL_ERROR", `Không tạo được nhóm món "${name}": ${error?.message ?? ""}`);
    }
    categoriesByName.set(name.toLowerCase(), created as { id: string; name: string });
  }

  let created = 0;
  let updated = 0;
  for (const row of preview.cleaned) {
    const data = row.data;
    const existingProduct = existingByCode.get(data.code);
    const category = data.category
      ? categoriesByName.get(data.category.toLowerCase()) ?? null
      : null;
    const payload = {
      organization_id: organizationId,
      code: data.code,
      name: data.name,
      category_id: category ? category.id : null,
      menu_type: data.menuType,
      product_type: data.productType,
      cost_price: data.costPrice ?? 0,
      sale_price: data.salePrice ?? 0,
      unit: data.unit,
      description: data.description ?? null,
      image_url: data.imageUrl ?? null,
      is_active: data.isActive ?? true,
    };
    if (existingProduct) {
      const update = category ? payload : { ...payload, category_id: existingProduct.category_id };
      const { error } = await admin.from("products").update(update).eq("id", existingProduct.id);
      if (error) return actionFail("INTERNAL_ERROR", `Không cập nhật được món ${data.code}: ${error.message}`);
      updated += 1;
    } else {
      const { data: inserted, error } = await admin
        .from("products")
        .insert(payload)
        .select("id")
        .single();
      if (error || !inserted) {
        return actionFail("INTERNAL_ERROR", `Không tạo được món ${data.code}: ${error?.message ?? ""}`);
      }
      created += 1;
    }
  }

  await admin.from("audit_logs").insert({
    organization_id: organizationId,
    actor_user_id: userId,
    action: "product.import",
    entity_type: "products",
    entity_id: null,
    after: {
      file_name: preview.fileName,
      created,
      updated,
      total_cleaned: preview.cleaned.length,
    },
  });
  revalidatePath("/menu");
  return actionOk({ upserted: created + updated, created, updated });
}

// ---------------- Inventory items preview / commit -----------------

export async function previewInventoryItems(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string
): Promise<ImportPreview<InventoryItemImportRow>> {
  const report = await parseToValidation(
    buffer,
    "Inventory",
    inventoryItemImportRowSchema,
    INVENTORY_ITEM_COLUMN_BY_FIELD,
    fileName
  );
  return buildPreview(report, fileName);
}

export async function commitInventoryItems(
  organizationId: string,
  branchId: string,
  userId: string,
  previewIn: ImportPreview<unknown>
): Promise<ActionResult<{ upserted: number; created: number; updated: number }>> {
  const preview = revalidatePreview(previewIn, inventoryItemImportRowSchema);
  if (preview.cleaned.length === 0) {
    return actionFail("NO_ROWS", "Không có dòng hợp lệ để ghi.");
  }
  const admin = createSupabaseAdminClient();
  const codes = Array.from(new Set(preview.cleaned.map((c) => c.data.code)));
  const { data: existing } = await admin
    .from("inventory_items")
    .select("id, code")
    .eq("organization_id", organizationId)
    .in("code", codes);
  const existingByCode = new Map<string, { id: string; code: string }>(
    (existing ?? []).map((row) => [row.code as string, row as { id: string; code: string }])
  );

  let created = 0;
  let updated = 0;
  for (const row of preview.cleaned) {
    const data = row.data;
    const existingItem = existingByCode.get(data.code);
    if (existingItem) {
      const quantity = Number(data.initialQuantity ?? 0);
      const threshold = Number(data.lowStockThreshold ?? 0);
      const { error } = await admin
        .from("inventory_items")
        .update({
          name: data.name,
          item_type: data.itemType,
          unit: data.unit,
          cost_price: data.costPrice ?? 0,
          description: data.description ?? null,
          image_url: data.imageUrl ?? null,
        })
        .eq("id", existingItem.id);
      if (error) {
        return actionFail("INTERNAL_ERROR", `Không cập nhật được hàng ${data.code}: ${error.message}`);
      }
      await admin.from("inventory_balances").upsert({
        organization_id: organizationId,
        branch_id: branchId,
        inventory_item_id: existingItem.id,
        quantity_on_hand: quantity,
        low_stock_threshold: threshold,
      }, { onConflict: "branch_id,inventory_item_id" });
      updated += 1;
      continue;
    }
    const initialQty = Number(data.initialQuantity ?? 0);
    const threshold = Number(data.lowStockThreshold ?? 0);
    const { data: inserted, error } = await admin
      .from("inventory_items")
      .insert({
        organization_id: organizationId,
        name: data.name,
        code: data.code,
        item_type: data.itemType,
        unit: data.unit,
        cost_price: data.costPrice ?? 0,
        description: data.description ?? null,
        image_url: data.imageUrl ?? null,
      })
      .select("id")
      .single();
    if (error || !inserted) {
      return actionFail("INTERNAL_ERROR", `Không tạo được hàng ${data.code}: ${error?.message ?? ""}`);
    }
    await admin.from("inventory_balances").upsert({
      organization_id: organizationId,
      branch_id: branchId,
      inventory_item_id: inserted.id,
      quantity_on_hand: initialQty,
      low_stock_threshold: threshold,
    });
    if (initialQty > 0) {
      await admin.from("inventory_movements").insert({
        organization_id: organizationId,
        branch_id: branchId,
        inventory_item_id: inserted.id,
        movement_type: "purchase",
        quantity_delta: initialQty,
        unit_cost: data.costPrice ?? 0,
        reference_type: "import",
        note: "Tạo mới từ Excel",
        created_by: userId,
      });
    }
    created += 1;
  }

  await admin.from("audit_logs").insert({
    organization_id: organizationId,
    branch_id: branchId,
    actor_user_id: userId,
    action: "inventory.import",
    entity_type: "inventory_items",
    entity_id: null,
    after: {
      file_name: preview.fileName,
      created,
      updated,
      total_cleaned: preview.cleaned.length,
    },
  });
  revalidatePath("/inventory");
  return actionOk({ upserted: created + updated, created, updated });
}

// ---------------- Inventory movements preview / commit ------------

export async function previewInventoryMovements(
  buffer: ArrayBuffer | Uint8Array,
  fileName: string
): Promise<ImportPreview<InventoryMovementImportRow>> {
  const report = await parseToValidation(
    buffer,
    "Movements",
    inventoryMovementImportRowSchema,
    INVENTORY_MOVEMENT_COLUMN_BY_FIELD,
    fileName
  );
  return buildPreview(report, fileName);
}

function resolveDirection(direction: string): 1 | -1 {
  const v = direction.trim().toLowerCase();
  if (v === "in" || v === "+" || v === "increase" || v === "tang") return 1;
  return -1;
}

export async function commitInventoryMovements(
  organizationId: string,
  branchId: string,
  userId: string,
  allowNegativeInventory: boolean,
  previewIn: ImportPreview<unknown>
): Promise<ActionResult<{ written: number; skipped: string[] }>> {
  const preview = revalidatePreview(previewIn, inventoryMovementImportRowSchema);
  if (preview.cleaned.length === 0) {
    return actionFail("NO_ROWS", "Không có dòng hợp lệ để ghi.");
  }
  const admin = createSupabaseAdminClient();

  const itemCodes = Array.from(new Set(preview.cleaned.map((c) => c.data.itemCode)));
  const { data: items } = await admin
    .from("inventory_items")
    .select("id, code")
    .eq("organization_id", organizationId)
    .in("code", itemCodes);
  const itemByCode = new Map<string, { id: string; code: string }>(
    (items ?? []).map((row) => [row.code as string, row as { id: string; code: string }])
  );

  const { data: balances } = await admin
    .from("inventory_balances")
    .select("id, inventory_item_id, quantity_on_hand")
    .eq("branch_id", branchId)
    .in(
      "inventory_item_id",
      (items ?? []).map((i) => i.id)
    );
  const balanceByItem = new Map<string, { id: string; quantity_on_hand: number }>(
    (balances ?? []).map((row) => [row.inventory_item_id as string, row as { id: string; quantity_on_hand: number }])
  );

  const skipped: string[] = [];
  const writeQueue: Array<{
    inventoryItemId: string;
    quantityDelta: number;
    unitCost: number;
    movementType: InventoryMovementImportRow["movementType"];
    note: string | null;
    movementDate: string | null;
  }> = [];

  for (const row of preview.cleaned) {
    const data = row.data;
    const item = itemByCode.get(data.itemCode);
    if (!item) {
      skipped.push(`Mã hàng "${data.itemCode}" không tồn tại (dòng ${row.rowNumber}).`);
      continue;
    }
    const sign = resolveDirection(data.direction);
    const quantity = Number(data.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) {
      skipped.push(`Số lượng không hợp lệ ở dòng ${row.rowNumber}.`);
      continue;
    }
    const delta = sign * quantity;
    if (delta < 0) {
      const balance = balanceByItem.get(item.id);
      const onHand = Number(balance?.quantity_on_hand ?? 0);
      const need = -delta;
      if (!allowNegativeInventory && onHand < need) {
        skipped.push(
          `Tồn kho không đủ cho mã ${data.itemCode} (còn ${onHand}, cần ${need}) ở dòng ${row.rowNumber}.`
        );
        continue;
      }
    }
    writeQueue.push({
      inventoryItemId: item.id,
      quantityDelta: delta,
      unitCost: Number(data.unitCost ?? 0),
      movementType: data.movementType,
      note: data.note ?? null,
      movementDate: data.movementDate ?? null,
    });
  }

  let written = 0;
  for (const w of writeQueue) {
    const movementPayload: Record<string, unknown> = {
      organization_id: organizationId,
      branch_id: branchId,
      inventory_item_id: w.inventoryItemId,
      movement_type: w.movementType,
      quantity_delta: w.quantityDelta,
      unit_cost: w.unitCost,
      note: w.note,
      created_by: userId,
      reference_type: "import",
    };
    if (w.movementDate) movementPayload.created_at = `${w.movementDate}T00:00:00.000Z`;
    const { data: mv, error } = await admin
      .from("inventory_movements")
      .insert(movementPayload)
      .select("id")
      .single();
    if (error || !mv) {
      return actionFail("INTERNAL_ERROR", `Không ghi được phiếu kho: ${error?.message ?? ""}`);
    }
    const balance = balanceByItem.get(w.inventoryItemId);
    if (balance) {
      const newQty = Number(balance.quantity_on_hand) + w.quantityDelta;
      await admin
        .from("inventory_balances")
        .update({ quantity_on_hand: newQty })
        .eq("id", balance.id);
      balance.quantity_on_hand = newQty;
    } else {
      const { data: created } = await admin
        .from("inventory_balances")
        .insert({
          organization_id: organizationId,
          branch_id: branchId,
          inventory_item_id: w.inventoryItemId,
          quantity_on_hand: w.quantityDelta,
          low_stock_threshold: 0,
        })
        .select("id, quantity_on_hand")
        .single();
      if (created) balanceByItem.set(w.inventoryItemId, created as { id: string; quantity_on_hand: number });
    }
    written += 1;
  }

  await admin.from("audit_logs").insert({
    organization_id: organizationId,
    branch_id: branchId,
    actor_user_id: userId,
    action: "inventory.movement.import",
    entity_type: "inventory_movements",
    entity_id: null,
    after: {
      file_name: preview.fileName,
      written,
      skipped: skipped.length,
      total_cleaned: preview.cleaned.length,
    },
  });
  revalidatePath("/inventory");
  return actionOk({ written, skipped });
}

