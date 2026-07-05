"use server";

import { revalidatePath } from "next/cache";
import { canManageInventory, canManageMenu, canViewReports, requireRole } from "@/lib/auth/permissions";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { ImportPreview } from "@/server/excel/imports";
import type { InventoryItemImportRow, InventoryMovementImportRow, ProductImportRow } from "@/lib/validation/excel-schemas";
import { listCategories, listProducts } from "@/server/queries/menu";
import { listInventoryBalances, listInventoryItems } from "@/server/queries/inventory";
import { computeEod, getOrCreateEodReport } from "@/server/queries/eod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { clearAiToolCache } from "@/server/ai/cache";

/**
 * Server actions that wrap the Excel import pipeline. The browser only
 * ever talks to these; the actual Excel parsing and Supabase admin
 * calls happen here so the service role never reaches the client.
 */

interface UploadPayload {
  fileName: string;
  contentBase64: string;
}

function decodeUpload(payload: UploadPayload): { fileName: string; buffer: Buffer } {
  return { fileName: payload.fileName, buffer: Buffer.from(payload.contentBase64, "base64") };
}

function errToMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

// ---------------- Preview ---------------------------------------

export async function previewProductImport(
  organizationId: string,
  payload: UploadPayload
): Promise<ActionResult<ImportPreview<ProductImportRow>>> {
  await requireRole(organizationId, canManageMenu);
  const { fileName, buffer } = decodeUpload(payload);
  try {
    const { previewProducts } = await import("@/server/excel/imports");
    const preview = await previewProducts(buffer, fileName);
    return actionOk(preview);
  } catch (e) {
    return actionFail("PARSE_ERROR", errToMessage(e, "Không đọc được tệp Excel"));
  }
}

export async function previewInventoryItemImport(
  organizationId: string,
  branchId: string,
  payload: UploadPayload
): Promise<ActionResult<ImportPreview<InventoryItemImportRow>>> {
  await requireRole(organizationId, canManageInventory);
  void branchId;
  const { fileName, buffer } = decodeUpload(payload);
  try {
    const { previewInventoryItems } = await import("@/server/excel/imports");
    const preview = await previewInventoryItems(buffer, fileName);
    return actionOk(preview);
  } catch (e) {
    return actionFail("PARSE_ERROR", errToMessage(e, "Không đọc được tệp Excel"));
  }
}

export async function previewInventoryMovementImport(
  organizationId: string,
  branchId: string,
  payload: UploadPayload
): Promise<ActionResult<ImportPreview<InventoryMovementImportRow>>> {
  await requireRole(organizationId, canManageInventory);
  void branchId;
  const { fileName, buffer } = decodeUpload(payload);
  try {
    const { previewInventoryMovements } = await import("@/server/excel/imports");
    const preview = await previewInventoryMovements(buffer, fileName);
    return actionOk(preview);
  } catch (e) {
    return actionFail("PARSE_ERROR", errToMessage(e, "Không đọc được tệp Excel"));
  }
}

// ---------------- Commit ---------------------------------------

export async function commitProductImport(
  organizationId: string,
  preview: ImportPreview<unknown>
): Promise<ActionResult<{ upserted: number; created: number; updated: number }>> {
  const membership = await requireRole(organizationId, canManageMenu);
  const { commitProducts } = await import("@/server/excel/imports");
  const result = await commitProducts(organizationId, membership.membership.user_id, preview);
  if (result.ok) revalidatePath("/menu");
  return result;
}

export async function commitInventoryItemImport(
  organizationId: string,
  branchId: string,
  preview: ImportPreview<unknown>
): Promise<ActionResult<{ upserted: number; created: number; updated: number }>> {
  const membership = await requireRole(organizationId, canManageInventory);
  const { commitInventoryItems } = await import("@/server/excel/imports");
  const result = await commitInventoryItems(
    organizationId,
    branchId,
    membership.membership.user_id,
    preview
  );
  if (result.ok) {
    revalidatePath("/inventory");
    clearAiToolCache();
  }
  return result;
}

export async function commitInventoryMovementImport(
  organizationId: string,
  branchId: string,
  preview: ImportPreview<unknown>
): Promise<ActionResult<{ written: number; skipped: string[] }>> {
  const membership = await requireRole(organizationId, canManageInventory);
  const admin = createSupabaseAdminClient();
  const { data: org } = await admin
    .from("organizations")
    .select("allow_negative_inventory")
    .eq("id", organizationId)
    .maybeSingle();
  const { commitInventoryMovements } = await import("@/server/excel/imports");
  const result = await commitInventoryMovements(
    organizationId,
    branchId,
    membership.membership.user_id,
    Boolean(org?.allow_negative_inventory),
    preview
  );
  if (result.ok) {
    revalidatePath("/inventory");
    clearAiToolCache();
  }
  return result;
}

// ---------------- Export helpers (return buffer metadata) --------

export interface ExcelDownload {
  fileName: string;
  base64: string;
  mime: string;
}

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function downloadProductTemplate(
  organizationId: string
): Promise<ActionResult<ExcelDownload>> {
  await requireRole(organizationId, canManageMenu);
  const { buildProductTemplate } = await import("@/server/excel/templates");
  const buf = await buildProductTemplate();
  return actionOk({
    fileName: "template-thuc-don.xlsx",
    base64: buf.toString("base64"),
    mime: XLSX_MIME,
  });
}

export async function downloadInventoryItemTemplate(
  organizationId: string
): Promise<ActionResult<ExcelDownload>> {
  await requireRole(organizationId, canManageInventory);
  const { buildInventoryItemTemplate } = await import("@/server/excel/templates");
  const buf = await buildInventoryItemTemplate();
  return actionOk({
    fileName: "template-hang-hoa.xlsx",
    base64: buf.toString("base64"),
    mime: XLSX_MIME,
  });
}

export async function downloadInventoryMovementTemplate(
  organizationId: string
): Promise<ActionResult<ExcelDownload>> {
  await requireRole(organizationId, canManageInventory);
  const { buildInventoryMovementTemplate } = await import("@/server/excel/templates");
  const buf = await buildInventoryMovementTemplate();
  return actionOk({
    fileName: "template-phieu-kho.xlsx",
    base64: buf.toString("base64"),
    mime: XLSX_MIME,
  });
}

export async function exportMenu(
  organizationId: string,
  search?: string
): Promise<ActionResult<ExcelDownload>> {
  await requireRole(organizationId, canManageMenu);
  const [categories, products] = await Promise.all([
    listCategories(organizationId),
    listProducts(organizationId, { search }),
  ]);
  const { buildMenuExport } = await import("@/server/excel/exports");
  const buf = await buildMenuExport({ categories, products });
  return actionOk({
    fileName: "thuc-don.xlsx",
    base64: buf.toString("base64"),
    mime: XLSX_MIME,
  });
}

export async function exportInventory(
  organizationId: string,
  branchId: string,
  search?: string
): Promise<ActionResult<ExcelDownload>> {
  await requireRole(organizationId, canManageInventory);
  const [items, balances] = await Promise.all([
    listInventoryItems(organizationId, search),
    listInventoryBalances(organizationId, branchId),
  ]);
  const { buildInventoryExport } = await import("@/server/excel/exports");
  const buf = await buildInventoryExport({ items, balances });
  return actionOk({
    fileName: "ton-kho.xlsx",
    base64: buf.toString("base64"),
    mime: XLSX_MIME,
  });
}

export async function exportEndOfDay(
  organizationId: string,
  branchId: string,
  reportDate: string
): Promise<ActionResult<ExcelDownload>> {
  await requireRole(organizationId, canViewReports);
  const supabase = createSupabaseServerClient();
  const { data: branch } = await supabase
    .from("branches")
    .select("id, name")
    .eq("id", branchId)
    .maybeSingle();
  const [data, savedReport] = await Promise.all([
    computeEod(branchId, reportDate),
    getOrCreateEodReport(organizationId, branchId, reportDate),
  ]);
  const { buildEodExport } = await import("@/server/excel/exports");
  const buf = await buildEodExport({
    branchName: branch?.name ?? "(không rõ)",
    date: reportDate,
    data,
    savedReport,
  });
  return actionOk({
    fileName: `bao-cao-${reportDate}.xlsx`,
    base64: buf.toString("base64"),
    mime: XLSX_MIME,
  });
}
