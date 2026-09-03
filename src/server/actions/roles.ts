"use server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const STANDARD_PERMISSIONS = [
  { permission_key: "EMPLOYEE_VIEW", module: "EMPLOYEE", description: "Xem hồ sơ nhân viên" },
  { permission_key: "EMPLOYEE_EDIT", module: "EMPLOYEE", description: "Thêm và sửa hồ sơ nhân viên" },
  { permission_key: "EMPLOYEE_STATUS_EDIT", module: "EMPLOYEE", description: "Đổi trạng thái nhân viên" },
  { permission_key: "RBAC_VIEW", module: "RBAC", description: "Xem vai trò và quyền" },
  { permission_key: "RBAC_EDIT", module: "RBAC", description: "Cấu hình vai trò và quyền" },
  { permission_key: "POS_ACCESS", module: "POS", description: "Truy cập màn hình bán hàng" },
  { permission_key: "ORDER_CREATE", module: "POS", description: "Tạo đơn hàng" },
  { permission_key: "ORDER_PAY", module: "POS", description: "Thanh toán đơn hàng" },
  { permission_key: "TABLE_MANAGE", module: "TABLE", description: "Quản lý bàn / phòng" },
  { permission_key: "KITCHEN_ACCESS", module: "KITCHEN", description: "Truy cập màn hình bếp" },
  { permission_key: "KITCHEN_UPDATE", module: "KITCHEN", description: "Cập nhật trạng thái món bếp" },
  { permission_key: "MENU_VIEW", module: "MENU", description: "Xem thực đơn" },
  { permission_key: "MENU_MANAGE", module: "MENU", description: "Thêm, sửa thực đơn và món" },
  { permission_key: "INVENTORY_VIEW", module: "INVENTORY", description: "Xem tồn kho" },
  { permission_key: "INVENTORY_MANAGE", module: "INVENTORY", description: "Quản lý xuất nhập tồn kho" },
  { permission_key: "REPORT_VIEW", module: "REPORT", description: "Xem báo cáo doanh thu" },
] as const;

const STANDARD_ROLES = [
  { name: "Admin", is_system_admin: true },
  { name: "Quản lý", is_system_admin: false },
  { name: "Thu ngân", is_system_admin: false },
  { name: "Bếp", is_system_admin: false },
  { name: "Nhân viên", is_system_admin: false },
] as const;

/**
 * Ensures all 5 standard roles and their RBAC permissions exist for an organization.
 * Can be called during onboarding, or during employee listing to self-heal existing orgs.
 */
export async function ensureStandardRolesAndPermissions(organizationId: string): Promise<void> {
  const admin = createSupabaseAdminClient();

  // 1. Ensure permissions exist in public.permissions
  await admin.from("permissions").upsert(
    STANDARD_PERMISSIONS.map((p) => ({
      permission_key: p.permission_key,
      module: p.module,
      description: p.description,
    })),
    { onConflict: "permission_key" }
  );

  // 2. Fetch all permissions to map permission_key -> ID
  const { data: dbPermissions } = await admin.from("permissions").select("id, permission_key");
  const permMap = new Map((dbPermissions ?? []).map((p) => [p.permission_key, p.id]));

  // 3. Upsert standard roles for this organization
  for (const role of STANDARD_ROLES) {
    const { data: existingRole } = await admin
      .from("roles")
      .select("id, name, is_system_admin")
      .eq("organization_id", organizationId)
      .eq("name", role.name)
      .maybeSingle();

    let roleId = existingRole?.id;

    if (!existingRole) {
      const { data: createdRole } = await admin
        .from("roles")
        .insert({
          organization_id: organizationId,
          name: role.name,
          is_system_admin: role.is_system_admin,
        })
        .select("id")
        .single();
      roleId = createdRole?.id;
    } else if (existingRole.is_system_admin !== role.is_system_admin) {
      await admin
        .from("roles")
        .update({ is_system_admin: role.is_system_admin })
        .eq("id", existingRole.id);
    }

    if (!roleId) continue;

    // 4. Map permission keys to role
    let rolePermKeys: readonly string[] = [];
    if (role.name === "Admin" || role.name === "Quản lý") {
      rolePermKeys = STANDARD_PERMISSIONS.map((p) => p.permission_key);
    } else if (role.name === "Thu ngân" || role.name === "Nhân viên") {
      rolePermKeys = ["POS_ACCESS", "ORDER_CREATE", "ORDER_PAY", "TABLE_MANAGE", "MENU_VIEW"];
    } else if (role.name === "Bếp") {
      rolePermKeys = ["KITCHEN_ACCESS", "KITCHEN_UPDATE", "MENU_VIEW"];
    }

    const rolePermsToInsert = rolePermKeys
      .map((key) => permMap.get(key))
      .filter((id): id is string => Boolean(id))
      .map((permissionId) => ({
        role_id: roleId as string,
        permission_id: permissionId,
      }));

    if (rolePermsToInsert.length > 0) {
      await admin
        .from("role_permissions")
        .upsert(rolePermsToInsert, { onConflict: "role_id,permission_id" });
    }
  }
}
