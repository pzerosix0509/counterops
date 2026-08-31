"use server";

import { revalidatePath } from "next/cache";
import { employeeSchema } from "@/lib/validation/schemas";
import { getMembershipForOrg, requireUser } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";

const manageRoles = ["owner", "admin"] as const;

async function requireEmployeePermission(organizationId: string, permission: string): Promise<
  | { user: Awaited<ReturnType<typeof requireUser>>; membership: NonNullable<Awaited<ReturnType<typeof getMembershipForOrg>>> }
  | { error: ReturnType<typeof actionFail> }
> {
  const user = await requireUser();
  const membership = await getMembershipForOrg(organizationId);
  if (!membership) return { error: actionFail("FORBIDDEN", "Bạn không thuộc cửa hàng này.") } as const;
  if (manageRoles.includes(membership.role as (typeof manageRoles)[number])) return { user, membership } as const;
  const admin = createSupabaseAdminClient();
  const { data } = await admin.rpc("has_employee_permission", { p_org_id: organizationId, p_permission_key: permission });
  if (!data) return { error: actionFail("FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.") } as const;
  return { user, membership } as const;
}

function validationErrors(error: { issues: { path: PropertyKey[]; message: string }[] }) {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) (fields[issue.path.join(".")] ??= []).push(issue.message);
  return fields;
}

export async function listEmployees(organizationId: string, branchId?: string): Promise<ActionResult<{ employees: unknown[]; roles: unknown[] }>> {
  const access = await requireEmployeePermission(organizationId, "EMPLOYEE_VIEW");
  if ("error" in access) return access.error;
  const admin = createSupabaseAdminClient();
  let employeeQuery = admin.from("employees").select("*, branch:branches(id, name), role:roles(id, name, is_system_admin)").eq("organization_id", organizationId).order("full_name");
  if (branchId) employeeQuery = employeeQuery.eq("branch_id", branchId);
  const [{ data: employees, error }, { data: roles, error: roleError }] = await Promise.all([
    employeeQuery,
    admin.from("roles").select("*").eq("organization_id", organizationId).order("name"),
  ]);
  if (error || roleError) return actionFail("INTERNAL_ERROR", "Không tải được danh sách nhân viên.");
  return actionOk({ employees: employees ?? [], roles: roles ?? [] });
}

export async function saveEmployee(organizationId: string, input: unknown): Promise<ActionResult<{ id: string }>> {
  const access = await requireEmployeePermission(organizationId, "EMPLOYEE_EDIT");
  if ("error" in access) return access.error;
  const parsed = employeeSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Thông tin nhân viên không hợp lệ.", validationErrors(parsed.error));
  const data = parsed.data;
  const admin = createSupabaseAdminClient();
  const { data: branch } = await admin.from("branches").select("id").eq("id", data.branchId).eq("organization_id", organizationId).eq("is_active", true).maybeSingle();
  if (!branch) return actionFail("VALIDATION_ERROR", "Chi nhánh không thuộc cửa hàng hoặc đã ngừng hoạt động.");
  const { data: hasAccess } = await admin.rpc("has_branch_access", { p_org_id: organizationId, p_branch_id: data.branchId });
  if (!hasAccess) return actionFail("FORBIDDEN", "Bạn không có quyền quản lý nhân viên tại chi nhánh này.");
  if (data.roleId) {
    const { data: role } = await admin.from("roles").select("id").eq("id", data.roleId).eq("organization_id", organizationId).maybeSingle();
    if (!role) return actionFail("VALIDATION_ERROR", "Vai trò không hợp lệ.");
  }
  const payload = {
    organization_id: organizationId,
    full_name: data.fullName,
    phone_number: data.phoneNumber || null,
    email: data.email || null,
    user_id: data.userId ?? null,
    role_id: data.roleId ?? null,
    branch_id: data.branchId,
    status: data.status,
    start_date: data.startDate,
    end_date: data.status === "RESIGNED" ? (data.endDate ?? new Date().toISOString().slice(0, 10)) : null,
  };
  if (data.id) {
    const { data: updated, error } = await admin
      .from("employees")
      .update(payload)
      .eq("id", data.id)
      .eq("organization_id", organizationId)
      .select("id")
      .single();
    if (error || !updated) return actionFail("INTERNAL_ERROR", "Không lưu được nhân viên: " + (error?.message ?? ""));
    await admin.from("audit_logs").insert({ organization_id: organizationId, branch_id: data.branchId, actor_user_id: access.user.id, action: "employee.update", entity_type: "employees", entity_id: updated.id, after: payload });
    revalidatePath("/employees");
    return actionOk({ id: updated.id });
  }

  const { data: created, error: createError } = await admin.rpc("create_employee", {
    p_org_id: organizationId,
    p_full_name: payload.full_name,
    p_phone_number: payload.phone_number,
    p_email: payload.email,
    p_user_id: payload.user_id,
    p_role_id: payload.role_id,
    p_branch_id: payload.branch_id,
    p_status: payload.status,
    p_start_date: payload.start_date,
    p_end_date: payload.end_date,
  });
  if (createError || !created) return actionFail("INTERNAL_ERROR", "Không lưu được nhân viên: " + (createError?.message ?? ""));

  const id = String(created);
  await admin.from("audit_logs").insert({ organization_id: organizationId, branch_id: data.branchId, actor_user_id: access.user.id, action: "employee.create", entity_type: "employees", entity_id: id, after: payload });
  revalidatePath("/employees");
  return actionOk({ id });
}

export async function changeEmployeeStatus(organizationId: string, employeeId: string, status: "INACTIVE" | "RESIGNED"): Promise<ActionResult<{ id: string }>> {
  const access = await requireEmployeePermission(organizationId, "EMPLOYEE_STATUS_EDIT");
  if ("error" in access) return access.error;
  const admin = createSupabaseAdminClient();
  const { data: employee, error: fetchError } = await admin.from("employees").select("id, branch_id").eq("id", employeeId).eq("organization_id", organizationId).maybeSingle();
  if (fetchError || !employee) return actionFail("NOT_FOUND", "Không tìm thấy nhân viên.");
  const { data: hasAccess } = await admin.rpc("has_branch_access", { p_org_id: organizationId, p_branch_id: employee.branch_id });
  if (!hasAccess) return actionFail("FORBIDDEN", "Bạn không có quyền thay đổi trạng thái nhân viên tại chi nhánh này.");
  const { error } = await admin.from("employees").update({ status, end_date: status === "RESIGNED" ? new Date().toISOString().slice(0, 10) : null }).eq("id", employeeId);
  if (error) return actionFail("INTERNAL_ERROR", "Không cập nhật được trạng thái: " + error.message);
  await admin.from("audit_logs").insert({ organization_id: organizationId, branch_id: employee.branch_id, actor_user_id: access.user.id, action: "employee.status.update", entity_type: "employees", entity_id: employee.id, after: { status } });
  revalidatePath("/employees");
  return actionOk({ id: employee.id });
}