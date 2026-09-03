"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { canManageTablesStructure, canUpdateTableStatus, requireRole } from "@/lib/auth/permissions";
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
  const m = await requireRole(organizationId, canManageTablesStructure);
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
  const m = await requireRole(organizationId, canManageTablesStructure);
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

export async function deleteTable(organizationId: string, tableId: string): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageTablesStructure);
  const admin = createSupabaseAdminClient();
  const { data: table } = await admin
    .from("dining_tables")
    .select("id, name, status, branch_id")
    .eq("id", tableId)
    .eq("organization_id", m.organization.id)
    .maybeSingle();
  if (!table) return actionFail("NOT_FOUND", "Không tìm thấy bàn");

  if (table.status !== "disabled") {
    return actionFail("CONFLICT", "Chỉ có thể xóa bàn khi trạng thái là Tạm khoá.");
  }

  const { data: openOrder } = await admin
    .from("orders")
    .select("id")
    .eq("table_id", tableId)
    .neq("status", "paid")
    .neq("status", "cancelled")
    .neq("status", "refunded")
    .limit(1)
    .maybeSingle();
  if (openOrder) {
    return actionFail("CONFLICT", "Bàn còn đơn đang mở, không thể xóa.");
  }

  const { error } = await admin
    .from("dining_tables")
    .delete()
    .eq("id", tableId)
    .eq("organization_id", m.organization.id);
  if (error) return actionFail("INTERNAL_ERROR", "Không xóa được bàn: " + error.message);

  await admin.from("audit_logs").insert({
    organization_id: m.organization.id,
    actor_user_id: m.membership.user_id,
    action: "table.delete",
    entity_type: "dining_tables",
    entity_id: tableId,
    after: { name: table.name, branch_id: table.branch_id },
  });

  revalidatePath("/tables");
  return actionOk({ id: tableId });
}

export async function deleteArea(organizationId: string, areaId: string): Promise<ActionResult<{ id: string }>> {
  const m = await requireRole(organizationId, canManageTablesStructure);
  const admin = createSupabaseAdminClient();
  const { data: area } = await admin
    .from("areas")
    .select("id, name, branch_id")
    .eq("id", areaId)
    .eq("organization_id", m.organization.id)
    .maybeSingle();
  if (!area) return actionFail("NOT_FOUND", "Không tìm thấy khu vực");

  const { data: tables } = await admin
    .from("dining_tables")
    .select("id")
    .eq("area_id", areaId)
    .eq("organization_id", m.organization.id);
  if (tables && tables.length > 0) {
    return actionFail("CONFLICT", "Khu vực vẫn còn bàn, hãy di chuyển hoặc xóa bàn trước.");
  }

  const { error } = await admin
    .from("areas")
    .delete()
    .eq("id", areaId)
    .eq("organization_id", m.organization.id);
  if (error) return actionFail("INTERNAL_ERROR", "Không xóa được khu vực: " + error.message);

  await admin.from("audit_logs").insert({
    organization_id: m.organization.id,
    actor_user_id: m.membership.user_id,
    action: "area.delete",
    entity_type: "areas",
    entity_id: areaId,
    after: { name: area.name, branch_id: area.branch_id },
  });

  revalidatePath("/tables");
  return actionOk({ id: areaId });
}

export async function updateTableStatus(organizationId: string, input: z.infer<typeof tableStatusSchema>): Promise<ActionResult<{ id: string; status: string }>> {
  const m = await requireRole(organizationId, canUpdateTableStatus);
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
