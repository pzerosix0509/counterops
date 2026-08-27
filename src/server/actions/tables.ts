"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { canManageTables, requireRole } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { canFreeTable } from "@/lib/calculations/tables";

const areaSchema = z.object({ name: z.string().min(1), sortOrder: z.number().int().default(0) });
const tableSchema = z.object({
  branchId: z.string().uuid(),
  areaId: z.string().uuid().nullable().optional(),
  name: z.string().min(1),
  seats: z.number().int().min(1).default(2),
  sortOrder: z.number().int().default(0),
});
const tableStatusSchema = z.object({
  tableId: z.string().uuid(),
  status: z.enum(["available", "occupied", "reserved", "disabled"]),
});

export async function createArea(organizationId: string, branchId: string, input: z.infer<typeof areaSchema>): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageTables);
  const parsed = areaSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Tên khu vực không hợp lệ");
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("areas")
    .insert({ organization_id: m.organization.id, branch_id: branchId, name: parsed.data.name, sort_order: parsed.data.sortOrder })
    .select("id")
    .single();
  if (error || !data) return actionFail("INTERNAL_ERROR", "Không tạo được khu vực");
  revalidatePath("/tables");
  return actionOk({ id: data.id });
}

export async function createTable(organizationId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageTables);
  const parsed = tableSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Thiếu thông tin bàn");
  const admin = createSupabaseAdminClient();
  const { data: exists } = await admin
    .from("dining_tables")
    .select("id")
    .eq("branch_id", parsed.data.branchId)
    .eq("name", parsed.data.name)
    .maybeSingle();
  if (exists) return actionFail("CONFLICT", "Bàn đã tồn tại trong chi nhánh", { name: ["Bàn đã tồn tại"] });
  const { data, error } = await admin
    .from("dining_tables")
    .insert({
      organization_id: m.organization.id,
      branch_id: parsed.data.branchId,
      area_id: parsed.data.areaId ?? null,
      name: parsed.data.name,
      seats: parsed.data.seats,
      sort_order: parsed.data.sortOrder,
    })
    .select("id")
    .single();
  if (error || !data) return actionFail("INTERNAL_ERROR", "Không tạo được bàn: " + (error?.message ?? ""));
  revalidatePath("/tables");
  return actionOk({ id: data.id });
}

export async function updateTableStatus(organizationId: string, input: z.infer<typeof tableStatusSchema>): Promise<ActionResult<{ id: string; status: string }>> {
  const m = await requireRole(organizationId, canManageTables);
  const parsed = tableStatusSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Trạng thái không hợp lệ");
  const admin = createSupabaseAdminClient();
  const { data: table } = await admin
    .from("dining_tables")
    .select("*")
    .eq("id", parsed.data.tableId)
    .eq("organization_id", m.organization.id)
    .maybeSingle();
  if (!table) return actionFail("NOT_FOUND", "Không tìm thấy bàn");
  if (parsed.data.status === "available" && table.status === "occupied") {
    const { data: openOrder } = await admin
      .from("orders")
      .select("id, status")
      .eq("table_id", parsed.data.tableId)
      .neq("status", "paid")
      .neq("status", "cancelled")
      .neq("status", "refunded")
      .limit(1)
      .maybeSingle();
    const allowed = canFreeTable(m.role, table.status, Boolean(openOrder));
    if (!allowed) {
      return actionFail("CONFLICT", "Bàn còn đơn đang mở, cần quản lý để chuyển trạng thái.");
    }
  }
  const { error } = await admin
    .from("dining_tables")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.tableId);
  if (error) return actionFail("INTERNAL_ERROR", "Không cập nhật được trạng thái");
  revalidatePath("/tables");
  return actionOk({ id: parsed.data.tableId, status: parsed.data.status });
}
