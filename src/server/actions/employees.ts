"use server";

import { revalidatePath } from "next/cache";
import { employeeSchema, employeeWithAuthSchema } from "@/lib/validation/schemas";
import { getMembershipForOrg, requireUser } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { ensureStandardRolesAndPermissions } from "@/server/actions/roles";

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

  let finalRoles = roles ?? [];

  // If standard roles (Thu ngân, Bếp, etc.) are missing, self-heal by provisioning them
  const existingRoleNames = new Set((finalRoles as { name: string }[]).map((r) => r.name));
  const hasAllStandard = ["Admin", "Quản lý", "Thu ngân", "Bếp", "Nhân viên"].every((name) => existingRoleNames.has(name));
  if (!hasAllStandard) {
    try {
      await ensureStandardRolesAndPermissions(organizationId);
      const { data: refreshedRoles } = await admin
        .from("roles")
        .select("*")
        .eq("organization_id", organizationId)
        .order("name");
      finalRoles = refreshedRoles ?? finalRoles;
    } catch (e) {
      console.error("Failed to self-heal standard roles:", e);
    }
  }

  return actionOk({ employees: employees ?? [], roles: finalRoles });
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
  
  // Skip branch access check for admins/owners (they can manage all branches)
  // For non-admins, verify they have access to this specific branch
  const isAdmin = manageRoles.includes(access.membership.role as (typeof manageRoles)[number]);
  if (!isAdmin) {
    const { data: hasAccess } = await admin.rpc("has_branch_access", { p_org_id: organizationId, p_branch_id: data.branchId });
    if (!hasAccess) return actionFail("FORBIDDEN", "Bạn không có quyền quản lý nhân viên tại chi nhánh này.");
  }
  
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
  
  // Skip branch access check for admins/owners (they can manage all branches)
  // For non-admins, verify they have access to this specific branch
  const isAdmin = manageRoles.includes(access.membership.role as (typeof manageRoles)[number]);
  if (!isAdmin) {
    const { data: hasAccess } = await admin.rpc("has_branch_access", { p_org_id: organizationId, p_branch_id: employee.branch_id });
    if (!hasAccess) return actionFail("FORBIDDEN", "Bạn không có quyền thay đổi trạng thái nhân viên tại chi nhánh này.");
  }
  
  const { error } = await admin.from("employees").update({ status, end_date: status === "RESIGNED" ? new Date().toISOString().slice(0, 10) : null }).eq("id", employeeId);
  if (error) return actionFail("INTERNAL_ERROR", "Không cập nhật được trạng thái: " + error.message);
  await admin.from("audit_logs").insert({ organization_id: organizationId, branch_id: employee.branch_id, actor_user_id: access.user.id, action: "employee.status.update", entity_type: "employees", entity_id: employee.id, after: { status } });
  revalidatePath("/employees");
  return actionOk({ id: employee.id });
}

function generateTemporaryPassword(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < 16; i++) password += chars.charAt(Math.floor(Math.random() * chars.length));
  return password;
}

export async function createEmployeeWithAuth(
  organizationId: string,
  input: unknown
): Promise<ActionResult<{ employeeId: string; email: string; tempPassword: string; requiresPasswordChange: boolean }>> {
  const access = await requireEmployeePermission(organizationId, "EMPLOYEE_EDIT");
  if ("error" in access) return access.error;

  const parsed = employeeWithAuthSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Thông tin nhân viên không hợp lệ.", validationErrors(parsed.error));

  const data = parsed.data;
  const admin = createSupabaseAdminClient();

  // Validate branch
  const { data: branch } = await admin
    .from("branches")
    .select("id")
    .eq("id", data.branchId)
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .maybeSingle();
  if (!branch) return actionFail("VALIDATION_ERROR", "Chi nhánh không thuộc cửa hàng hoặc đã ngừng hoạt động.");

  // Skip branch access check for admins/owners (they can manage all branches)
  // For non-admins, verify they have access to this specific branch
  const isAdmin = manageRoles.includes(access.membership.role as (typeof manageRoles)[number]);
  if (!isAdmin) {
    const { data: hasAccess } = await admin.rpc("has_branch_access", { p_org_id: organizationId, p_branch_id: data.branchId });
    if (!hasAccess) return actionFail("FORBIDDEN", "Bạn không có quyền quản lý nhân viên tại chi nhánh này.");
  }

  // Validate role
  const { data: role } = await admin
    .from("roles")
    .select("id, name, is_system_admin")
    .eq("id", data.roleId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (!role) return actionFail("VALIDATION_ERROR", "Vai trò không hợp lệ.");

  // Check if email already exists
  const { data: existingAuth } = await admin.auth.admin.listUsers();
  if (data.createAuthAccount) {
    const emailExists = existingAuth?.users?.some((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (emailExists) return actionFail("VALIDATION_ERROR", "Email đã được sử dụng. Vui lòng chọn email khác.");
  }

  let authUserId: string | null = null;
  let tempPassword: string | null = null;

  // Create auth account if requested
  if (data.createAuthAccount) {
    tempPassword = generateTemporaryPassword();
    try {
      const { data: newAuthUser, error: authError } = await admin.auth.admin.createUser({
        email: data.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: data.fullName,
          organization_id: organizationId,
          organization_roles: [data.roleId],
        },
      });

      if (authError || !newAuthUser?.user) {
        return actionFail("INTERNAL_ERROR", `Không tạo được tài khoản: ${authError?.message ?? "Unknown error"}`);
      }

      authUserId = newAuthUser.user.id;

      // Ensure profile exists for foreign key constraint
      await admin.from("profiles").upsert({
        id: authUserId,
        full_name: data.fullName,
        phone: data.phoneNumber || null,
        default_organization_id: organizationId,
        force_password_reset: true,
      });

      // Map role to membership role
      let membershipRole: "admin" | "manager" | "cashier" | "reception" | "kitchen" | "staff" = "staff";
      if (role.is_system_admin || role.name === "Admin") {
        membershipRole = "admin";
      } else if (role.name === "Quản lý" || role.name === "Manager") {
        membershipRole = "manager";
      } else if (role.name === "Thu ngân" || role.name === "Cashier") {
        membershipRole = "cashier";
      } else if (role.name === "Lễ tân" || role.name === "Reception") {
        membershipRole = "reception";
      } else if (role.name === "Bếp" || role.name === "Kitchen") {
        membershipRole = "kitchen";
      } else {
        membershipRole = "staff";
      }

      // Ensure membership exists so employee can access assigned branch & modules
      await admin.from("memberships").upsert(
        {
          organization_id: organizationId,
          branch_id: data.branchId,
          user_id: authUserId,
          role: membershipRole,
          status: "active",
        },
        { onConflict: "organization_id,branch_id,user_id,role" }
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return actionFail("INTERNAL_ERROR", `Lỗi tạo tài khoản: ${message}`);
    }
  }

  // Create employee record
  const { data: created, error: createError } = await admin.rpc("create_employee", {
    p_org_id: organizationId,
    p_full_name: data.fullName,
    p_phone_number: data.phoneNumber || null,
    p_email: data.email,
    p_user_id: authUserId,
    p_role_id: data.roleId,
    p_branch_id: data.branchId,
    p_status: "ACTIVE",
    p_start_date: data.startDate,
    p_end_date: null,
  });

  if (createError || !created) {
    // If employee creation fails but auth account was created, attempt cleanup
    if (authUserId) {
      try {
        await admin.from("memberships").delete().eq("user_id", authUserId);
        await admin.from("profiles").delete().eq("id", authUserId);
        await admin.auth.admin.deleteUser(authUserId);
      } catch {
        // Log cleanup failure but don't fail the overall response
        console.error("Failed to cleanup auth user after employee creation failure");
      }
    }
    return actionFail("INTERNAL_ERROR", `Không lưu được nhân viên: ${createError?.message ?? ""}`);
  }

  const employeeId = String(created);
  const payload = {
    organization_id: organizationId,
    full_name: data.fullName,
    phone_number: data.phoneNumber || null,
    email: data.email,
    user_id: authUserId,
    role_id: data.roleId,
    branch_id: data.branchId,
    status: "ACTIVE",
    start_date: data.startDate,
    has_auth_account: data.createAuthAccount,
  };

  await admin.from("audit_logs").insert({
    organization_id: organizationId,
    branch_id: data.branchId,
    actor_user_id: access.user.id,
    action: "employee.create_with_auth",
    entity_type: "employees",
    entity_id: employeeId,
    after: payload,
  });

  revalidatePath("/employees");

  return actionOk({
    employeeId,
    email: data.email,
    tempPassword: tempPassword || "",
    requiresPasswordChange: data.createAuthAccount,
  });
}

// ─── Retroactive Auth Provisioning ─────────────────────────────────────────

export async function provisionAccountForEmployee(
  organizationId: string,
  employeeId: string,
  email: string
): Promise<ActionResult<{ email: string; tempPassword: string }>> {
  const access = await requireEmployeePermission(organizationId, "EMPLOYEE_EDIT");
  if ("error" in access) return access.error;

  const admin = createSupabaseAdminClient();

  // Fetch employee with role
  const { data: employee, error: fetchError } = await admin
    .from("employees")
    .select("*, role:roles(id, name, is_system_admin)")
    .eq("id", employeeId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (fetchError || !employee) return actionFail("NOT_FOUND", "Không tìm thấy nhân viên.");
  if (employee.user_id) return actionFail("CONFLICT", "Nhân viên này đã có tài khoản đăng nhập.");

  const targetEmail = email.trim().toLowerCase();
  if (!targetEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return actionFail("VALIDATION_ERROR", "Email không hợp lệ.");
  }

  // Check if email is already taken in auth
  const { data: existingUsers } = await admin.auth.admin.listUsers();
  const emailTaken = existingUsers?.users?.some((u) => u.email?.toLowerCase() === targetEmail);
  if (emailTaken) return actionFail("CONFLICT", "Email này đã được sử dụng bởi tài khoản khác.");

  const tempPassword = generateTemporaryPassword();

  // Create auth user
  const { data: newAuthUser, error: authError } = await admin.auth.admin.createUser({
    email: targetEmail,
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      full_name: employee.full_name,
      organization_id: organizationId,
    },
  });

  if (authError || !newAuthUser?.user) {
    return actionFail("INTERNAL_ERROR", `Không tạo được tài khoản: ${authError?.message ?? "Unknown error"}`);
  }

  const authUserId = newAuthUser.user.id;

  try {
    // Upsert profile
    await admin.from("profiles").upsert({
      id: authUserId,
      full_name: employee.full_name,
      phone: employee.phone_number || null,
      default_organization_id: organizationId,
      force_password_reset: true,
    });

    // Map employee role → membership role
    const role = employee.role as { id: string; name: string; is_system_admin: boolean } | null;
    let membershipRole: "admin" | "manager" | "cashier" | "reception" | "kitchen" | "staff" = "staff";
    if (role?.is_system_admin || role?.name === "Admin") {
      membershipRole = "admin";
    } else if (role?.name === "Quản lý" || role?.name === "Manager") {
      membershipRole = "manager";
    } else if (role?.name === "Thu ngân" || role?.name === "Cashier") {
      membershipRole = "cashier";
    } else if (role?.name === "Lễ tân" || role?.name === "Reception") {
      membershipRole = "reception";
    } else if (role?.name === "Bếp" || role?.name === "Kitchen") {
      membershipRole = "kitchen";
    }

    // Upsert membership
    await admin.from("memberships").upsert(
      {
        organization_id: organizationId,
        branch_id: employee.branch_id,
        user_id: authUserId,
        role: membershipRole,
        status: "active",
      },
      { onConflict: "organization_id,branch_id,user_id,role" }
    );

    // Link user_id on employee record
    const { error: updateError } = await admin
      .from("employees")
      .update({ user_id: authUserId, email: targetEmail })
      .eq("id", employeeId)
      .eq("organization_id", organizationId);

    if (updateError) throw new Error(updateError.message);

    await admin.from("audit_logs").insert({
      organization_id: organizationId,
      branch_id: employee.branch_id,
      actor_user_id: access.user.id,
      action: "employee.provision_account",
      entity_type: "employees",
      entity_id: employeeId,
      after: { user_id: authUserId, email: targetEmail },
    });

    revalidatePath("/employees");
    return actionOk({ email: targetEmail, tempPassword });
  } catch (err: unknown) {
    // Attempt rollback of auth user
    try {
      await admin.from("memberships").delete().eq("user_id", authUserId);
      await admin.from("profiles").delete().eq("id", authUserId);
      await admin.auth.admin.deleteUser(authUserId);
    } catch {
      console.error("Failed to rollback auth user after provision failure");
    }
    const message = err instanceof Error ? err.message : "Unknown error";
    return actionFail("INTERNAL_ERROR", `Lỗi cấp tài khoản: ${message}`);
  }
}

// ─── Hard Delete (Accidental Creation Only) ─────────────────────────────────

export async function deleteEmployee(
  organizationId: string,
  employeeId: string
): Promise<ActionResult<{ id: string }>> {
  const access = await requireEmployeePermission(organizationId, "EMPLOYEE_EDIT");
  if ("error" in access) return access.error;

  // Only admins / owners can hard-delete
  const isAdmin = manageRoles.includes(access.membership.role as (typeof manageRoles)[number]);
  if (!isAdmin) return actionFail("FORBIDDEN", "Chỉ quản lý hoặc chủ cửa hàng mới có thể xóa hồ sơ nhân viên.");

  const admin = createSupabaseAdminClient();

  // Fetch employee to verify it exists and has no linked auth account
  const { data: employee, error: fetchError } = await admin
    .from("employees")
    .select("id, branch_id, user_id, organization_id")
    .eq("id", employeeId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (fetchError || !employee) return actionFail("NOT_FOUND", "Không tìm thấy nhân viên.");

  // Safety check: refuse hard delete if auth account is already linked
  if (employee.user_id) {
    return actionFail(
      "CONFLICT",
      "Nhân viên đã có tài khoản đăng nhập. Hãy dùng chức năng \"Cho nghỉ việc\" để vô hiệu hóa nhân viên."
    );
  }

  // Attempt hard delete — Postgres FK constraints act as a secondary safety net
  const { error: deleteError } = await admin
    .from("employees")
    .delete()
    .eq("id", employeeId)
    .eq("organization_id", organizationId);

  if (deleteError) {
    // FK violation codes: 23503 in PostgreSQL
    const isFkViolation =
      deleteError.code === "23503" ||
      deleteError.message?.toLowerCase().includes("foreign key") ||
      deleteError.message?.toLowerCase().includes("violates");
    if (isFkViolation) {
      return actionFail(
        "CONFLICT",
        "Không thể xóa nhân viên vì hồ sơ đã có dữ liệu liên quan (đơn hàng, chấm công…). Hãy dùng \"Cho nghỉ việc\"."
      );
    }
    return actionFail("INTERNAL_ERROR", `Xóa thất bại: ${deleteError.message}`);
  }

  await admin.from("audit_logs").insert({
    organization_id: organizationId,
    branch_id: employee.branch_id,
    actor_user_id: access.user.id,
    action: "employee.delete",
    entity_type: "employees",
    entity_id: employeeId,
    after: null,
  });

  revalidatePath("/employees");
  return actionOk({ id: employeeId });
}

// ─── Reset password for an already-linked employee ───────────────────────────

export async function resetPasswordForEmployee(
  organizationId: string,
  employeeId: string
): Promise<ActionResult<{ email: string; tempPassword: string }>> {
  const access = await requireEmployeePermission(organizationId, "EMPLOYEE_EDIT");
  if ("error" in access) return access.error;

  const admin = createSupabaseAdminClient();

  const { data: employee, error: fetchError } = await admin
    .from("employees")
    .select("id, full_name, email, user_id, branch_id")
    .eq("id", employeeId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (fetchError || !employee) return actionFail("NOT_FOUND", "Không tìm thấy nhân viên.");
  if (!employee.user_id) return actionFail("CONFLICT", "Nhân viên này chưa có tài khoản đăng nhập.");

  const tempPassword = generateTemporaryPassword();

  const { error: updateAuthError } = await admin.auth.admin.updateUserById(employee.user_id, {
    password: tempPassword,
  });
  if (updateAuthError) {
    return actionFail("INTERNAL_ERROR", `Không đặt lại mật khẩu được: ${updateAuthError.message}`);
  }

  // Re-set force_password_reset so the employee must change it on next login
  await admin.from("profiles").update({ force_password_reset: true }).eq("id", employee.user_id);

  await admin.from("audit_logs").insert({
    organization_id: organizationId,
    branch_id: employee.branch_id,
    actor_user_id: access.user.id,
    action: "employee.reset_password",
    entity_type: "employees",
    entity_id: employeeId,
    after: { reset_by: access.user.id },
  });

  const email = employee.email ?? "";
  return actionOk({ email, tempPassword });
}
