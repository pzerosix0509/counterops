"use server";

import { revalidatePath } from "next/cache";
import { getMembershipForOrg, requireUser } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { z } from "zod";

const manageRoles = ["owner", "admin"] as const;

async function requireEmployeePermission(organizationId: string, permission: string): Promise<
  | { user: Awaited<ReturnType<typeof requireUser>>; membership: NonNullable<Awaited<ReturnType<typeof getMembershipForOrg>>> }
  | { error: ReturnType<typeof actionFail> }
> {
  const user = await requireUser();
  const membership = await getMembershipForOrg(organizationId);
  if (!membership) return { error: actionFail("FORBIDDEN", "Bạn không thuộc tổ chức này.") } as const;
  if (manageRoles.includes(membership.role as (typeof manageRoles)[number])) return { user, membership } as const;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.rpc("has_employee_permission", { p_org_id: organizationId, p_permission_key: permission });
  if (!data) return { error: actionFail("FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.") } as const;
  return { user, membership } as const;
}

const shiftSchema = z.object({
  id: z.string().optional(),
  organization_id: z.string().uuid(),
  branch_id: z.string().uuid(),
  name: z.string().min(1, "Tên ca không được để trống"),
  start_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/, "Giờ bắt đầu không hợp lệ"),
  end_time: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/, "Giờ kết thúc không hợp lệ"),
  is_active: z.boolean().default(true),
});

export async function getShifts(branchId: string, organizationId: string): Promise<ActionResult<any[]>> {
  const user = await requireUser();
  const membership = await getMembershipForOrg(organizationId);
  if (!membership) return actionFail("FORBIDDEN", "Bạn không có quyền truy cập.");

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("shifts")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .order("start_time");

  if (error) {
    console.error("Error fetching shifts:", error);
    return actionFail("INTERNAL_ERROR", "Không thể tải danh sách ca làm việc.");
  }
  return actionOk(data);
}

export async function upsertShift(input: z.infer<typeof shiftSchema>): Promise<ActionResult<any>> {
  const parsed = shiftSchema.safeParse(input);
  if (!parsed.success) {
    return actionFail("BAD_REQUEST", "Dữ liệu không hợp lệ");
  }

  const data = parsed.data;
  const access = await requireEmployeePermission(data.organization_id, "EMPLOYEE_EDIT");
  if ("error" in access) return access.error;

  const admin = createSupabaseAdminClient();

  if (data.id) {
    const { data: updated, error } = await admin
      .from("shifts")
      .update({
        name: data.name,
        start_time: data.start_time,
        end_time: data.end_time,
        is_active: data.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.id)
      .eq("organization_id", data.organization_id)
      .eq("branch_id", data.branch_id)
      .select()
      .single();

    if (error) {
      console.error("Error updating shift:", error);
      return actionFail("INTERNAL_ERROR", "Không thể cập nhật ca làm việc.");
    }
    revalidatePath(`/dashboard/${data.organization_id}/schedules`);
    return actionOk(updated);
  } else {
    const { data: inserted, error } = await admin
      .from("shifts")
      .insert({
        organization_id: data.organization_id,
        branch_id: data.branch_id,
        name: data.name,
        start_time: data.start_time,
        end_time: data.end_time,
        is_active: data.is_active,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating shift:", error);
      return actionFail("INTERNAL_ERROR", "Không thể tạo ca làm việc mới.");
    }
    revalidatePath(`/dashboard/${data.organization_id}/schedules`);
    return actionOk(inserted);
  }
}

export async function getWeeklySchedule(branchId: string, organizationId: string, startDate: string, endDate: string): Promise<ActionResult<any[]>> {
  const user = await requireUser();
  const membership = await getMembershipForOrg(organizationId);
  if (!membership) return actionFail("FORBIDDEN", "Bạn không có quyền truy cập.");

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("employee_schedules")
    .select("*, shift:shifts(*), employee:employees(*)")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .gte("work_date", startDate)
    .lte("work_date", endDate)
    .order("work_date");

  if (error) {
    console.error("Error fetching schedules:", error);
    return actionFail("INTERNAL_ERROR", "Không thể tải lịch làm việc.");
  }
  return actionOk(data);
}

export async function assignSchedule(
  organizationId: string,
  branchId: string,
  employeeId: string,
  shiftId: string,
  workDate: string,
  notes?: string
): Promise<ActionResult<any>> {
  const access = await requireEmployeePermission(organizationId, "EMPLOYEE_EDIT");
  if ("error" in access) return access.error;

  const admin = createSupabaseAdminClient();
  
  // Enforce unique constraint by attempting to insert, and handle 23505 (unique_violation)
  const { data, error } = await admin
    .from("employee_schedules")
    .insert({
      organization_id: organizationId,
      branch_id: branchId,
      employee_id: employeeId,
      shift_id: shiftId,
      work_date: workDate,
      notes: notes || null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error assigning schedule:", error);
    if (error.code === "23505") {
      return actionFail("CONFLICT", "Nhân viên đã được xếp vào ca này trong ngày.");
    }
    return actionFail("INTERNAL_ERROR", "Không thể xếp lịch làm việc.");
  }
  revalidatePath(`/dashboard/${organizationId}/schedules`);
  return actionOk(data);
}

export async function removeSchedule(organizationId: string, scheduleId: string): Promise<ActionResult<void>> {
  const access = await requireEmployeePermission(organizationId, "EMPLOYEE_EDIT");
  if ("error" in access) return access.error;

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("employee_schedules")
    .delete()
    .eq("id", scheduleId)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Error removing schedule:", error);
    return actionFail("INTERNAL_ERROR", "Không thể xóa lịch làm việc.");
  }
  revalidatePath(`/dashboard/${organizationId}/schedules`);
  return actionOk(undefined);
}

export async function deleteShift(organizationId: string, shiftId: string): Promise<ActionResult<void>> {
  const access = await requireEmployeePermission(organizationId, "EMPLOYEE_EDIT");
  if ("error" in access) return access.error;

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("shifts")
    .delete()
    .eq("id", shiftId)
    .eq("organization_id", organizationId);

  if (error) {
    console.error("Error deleting shift:", error);
    if (error.code === "23503") {
      return actionFail("CONFLICT", "Không thể xóa ca làm việc đã có nhân viên được xếp lịch. Vui lòng chuyển ca về trạng thái 'Tạm tắt'.");
    }
    return actionFail("INTERNAL_ERROR", "Không thể xóa ca làm việc.");
  }
  revalidatePath(`/dashboard/${organizationId}/schedules`);
  return actionOk(undefined);
}
