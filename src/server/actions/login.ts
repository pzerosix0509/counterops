"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSession } from "@/lib/auth/permissions";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";

// ─── RBAC Redirect ───────────────────────────────────────────────────────────

/**
 * Determines the redirect path based on the authenticated user's role.
 * Called server-side from /auth/session-redirect AFTER cookies are set.
 */
export async function getRedirectPathForUser(): Promise<
  ActionResult<{
    redirectTo: string;
    role: "owner" | "manager" | "staff" | "unknown";
  }>
> {
  const user = await getSession();
  if (!user) {
    return actionFail("UNAUTHORIZED", "Người dùng chưa xác thực.");
  }

  const supabase = createSupabaseServerClient();
  const admin = createSupabaseAdminClient();

  // Check force_password_reset flag first — applies to provisioned accounts
  const { data: profile } = await supabase
    .from("profiles")
    .select("force_password_reset")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.force_password_reset) {
    return actionOk({ redirectTo: "/change-password", role: "staff" });
  }

  // 1. Get user's memberships to find organization
  const { data: memberships, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id, branch_id, role")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1);

  if (membershipError || !memberships || memberships.length === 0) {
    // Check if user has an employee record by user_id or email (auto-heal path)
    const { data: employee } = await admin
      .from("employees")
      .select("*, role:roles(id, name, is_system_admin)")
      .or(`user_id.eq.${user.id},email.eq.${user.email}`)
      .eq("status", "ACTIVE")
      .maybeSingle();

    if (employee) {
      const roleName = (employee.role as any)?.name || "Nhân viên";
      const isSystemAdmin = (employee.role as any)?.is_system_admin ?? false;
      let membershipRole: "admin" | "manager" | "cashier" | "reception" | "kitchen" | "staff" = "staff";

      if (isSystemAdmin || roleName === "Admin") {
        membershipRole = "admin";
      } else if (roleName === "Quản lý" || roleName === "Manager") {
        membershipRole = "manager";
      } else if (roleName === "Thu ngân" || roleName === "Cashier") {
        membershipRole = "cashier";
      } else if (roleName === "Bếp" || roleName === "Kitchen") {
        membershipRole = "kitchen";
      } else {
        membershipRole = "staff";
      }

      await admin.from("profiles").upsert({
        id: user.id,
        full_name: (user.user_metadata?.full_name as string | undefined) ?? employee.full_name,
        default_organization_id: employee.organization_id,
      });

      await admin.from("employees").update({ user_id: user.id }).eq("id", employee.id);

      await admin.from("memberships").upsert(
        {
          organization_id: employee.organization_id,
          branch_id: employee.branch_id,
          user_id: user.id,
          role: membershipRole,
          status: "active",
        },
        { onConflict: "organization_id,branch_id,user_id,role" }
      );

      if (membershipRole === "admin" || membershipRole === "manager") {
        return actionOk({ redirectTo: "/inventory", role: "manager" });
      }
      if (membershipRole === "kitchen") {
        return actionOk({ redirectTo: "/kitchen", role: "staff" });
      }
      return actionOk({ redirectTo: "/pos", role: "staff" });
    }

    // No membership and no employee — send to onboarding
    return actionOk({ redirectTo: "/onboarding", role: "unknown" });
  }

  const membership = memberships[0];
  const organizationId = membership.organization_id;

  // 2. Owner / admin → inventory
  if (membership.role === "owner" || membership.role === "admin") {
    return actionOk({
      redirectTo: "/inventory",
      role: membership.role === "owner" ? "owner" : "manager",
    });
  }

  // 3. Manager membership → inventory
  if (membership.role === "manager") {
    return actionOk({ redirectTo: "/inventory", role: "manager" });
  }

  // 4. Employee record with manager-level role → inventory
  const { data: employee } = await supabase
    .from("employees")
    .select("*, role:roles(id, name, is_system_admin)")
    .eq("user_id", user.id)
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .maybeSingle();

  if (employee) {
    const roleName = (employee.role as any)?.name || "Nhân viên";
    const isSystemAdmin = (employee.role as any)?.is_system_admin ?? false;

    if (isSystemAdmin || roleName === "Admin" || roleName === "Quản lý" || roleName === "Manager") {
      return actionOk({ redirectTo: "/inventory", role: "manager" });
    }
  }

  // 5. Kitchen
  if (membership.role === "kitchen") {
    return actionOk({ redirectTo: "/kitchen", role: "staff" });
  }

  // 6. Default POS (staff, cashier, reception)
  return actionOk({ redirectTo: "/pos", role: "staff" });
}

// ─── Clear force_password_reset after employee changes their password ─────────

export async function clearForcePasswordReset(): Promise<ActionResult<{ done: true }>> {
  const user = await getSession();
  if (!user) return actionFail("UNAUTHORIZED", "Người dùng chưa xác thực.");

  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("profiles")
    .update({ force_password_reset: false })
    .eq("id", user.id);

  if (error) return actionFail("INTERNAL_ERROR", "Không cập nhật được trạng thái: " + error.message);
  return actionOk({ done: true });
}
