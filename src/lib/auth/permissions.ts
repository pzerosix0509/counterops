import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Branch, Membership, MembershipRole, Organization, Profile } from "@/types/database";

export interface ActiveMembership {
  membership: Membership;
  role: MembershipRole;
  organization: Organization;
  branch: Branch | null;
  isOrgWide: boolean;
}

export const getSession = cache(async () => {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = createSupabaseServerClient();
  const user = await getSession();
  if (!user) return null;
  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();
  return data ?? null;
});

export const getActiveMemberships = cache(async (): Promise<ActiveMembership[]> => {
  const supabase = createSupabaseServerClient();
  const user = await getSession();
  if (!user) return [];
  const { data, error } = await supabase
    .from("memberships")
    .select("*, organization:organizations(*), branch:branches(*)")
    .eq("user_id", user.id)
    .eq("status", "active");
  if (error || !data) return [];
  return data
    .filter((row) => (row as any).organization)
    .map((row) => {
      const organization = (row as any).organization as Organization;
      const branch = ((row as any).branch as Branch | null) ?? null;
      return {
        membership: {
          id: row.id,
          organization_id: row.organization_id,
          branch_id: row.branch_id,
          user_id: row.user_id,
          role: row.role,
          status: row.status,
          invited_by: row.invited_by,
          joined_at: row.joined_at,
          created_at: row.created_at,
        },
        role: row.role,
        organization,
        branch,
        isOrgWide: row.branch_id === null,
      };
    });
});

export async function getActiveOrganizationId(): Promise<string | null> {
  const memberships = await getActiveMemberships();
  if (memberships.length === 0) return null;
  const profile = await getCurrentProfile();
  const defaultOrg = profile?.default_organization_id;
  if (defaultOrg) {
    const found = memberships.find((m) => m.organization.id === defaultOrg);
    if (found) return found.organization.id;
  }
  return memberships[0].organization.id;
}

export async function getActiveBranchId(organizationId: string): Promise<string | null> {
  const memberships = await getActiveMemberships();
  const inOrg = memberships.filter((m) => m.organization.id === organizationId);
  if (inOrg.length === 0) return null;
  const cookieStore = cookies();
  const cookieBranch = cookieStore.get("active_branch")?.value ?? null;
  if (cookieBranch) {
    const explicit = inOrg.find((m) => m.branch?.id === cookieBranch);
    if (explicit?.branch) return explicit.branch.id;
  }
  const orgWide = inOrg.find((m) => m.isOrgWide && m.branch);
  if (orgWide?.branch) return orgWide.branch.id;
  const scoped = inOrg.find((m) => m.branch);
  if (scoped?.branch) return scoped.branch.id;
  // Fallback: owner/org-wide membership may not reference a specific branch.
  // Pull the first active branch of the organization so the app still has a working scope.
  const { createSupabaseServerClient } = await import("@/lib/supabase/server");
  const supabase = createSupabaseServerClient();
  const { data } = await supabase
    .from("branches")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function getActiveMembership(): Promise<ActiveMembership | null> {
  const orgId = await getActiveOrganizationId();
  if (!orgId) return null;
  const memberships = await getActiveMemberships();
  const inOrg = memberships.filter((m) => m.organization.id === orgId);
  if (inOrg.length === 0) return null;
  const branchId = await getActiveBranchId(orgId);
  if (branchId) {
    const match = inOrg.find((m) => m.branch?.id === branchId);
    if (match) return match;
  }
  // Owner org-wide with no branch assigned: synthesize a branch object so
  // app shell and other callers always have a usable branch.
  const ownerMembership = inOrg[0];
  if (!branchId) return { ...ownerMembership, branch: null, isOrgWide: true };
  return { ...ownerMembership, branch: { id: branchId, organization_id: ownerMembership.organization.id, name: "Chi nhánh mặc định", address: null, phone: null, timezone: ownerMembership.organization.timezone, is_active: true, created_at: ownerMembership.organization.created_at, updated_at: ownerMembership.organization.updated_at }, isOrgWide: true };
}

export async function getMembershipForOrg(organizationId: string): Promise<ActiveMembership | null> {
  const memberships = await getActiveMemberships();
  return memberships.find((m) => m.organization.id === organizationId) ?? null;
}

export async function requireUser() {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}

export async function requireOrganization() {
  await requireUser();
  const organizationId = await getActiveOrganizationId();
  if (!organizationId) redirect("/onboarding");
  return organizationId;
}

export async function requireActiveContext(): Promise<{ organizationId: string; branchId: string; role: MembershipRole; userId: string }> {
  const user = await requireUser();
  const orgId = await getActiveOrganizationId();
  if (!orgId) redirect("/onboarding");
  const branchId = await getActiveBranchId(orgId);
  if (!branchId) redirect("/access-error?code=missing_branch");
  const m = await getMembershipForOrg(orgId);
  return {
    organizationId: orgId,
    branchId,
    role: m?.role ?? "staff",
    userId: user.id,
  };
}

export async function requireRole(organizationId: string, allowed: MembershipRole[]): Promise<ActiveMembership> {
  await requireUser();
  const m = await getMembershipForOrg(organizationId);
  if (!m) redirect("/onboarding");
  if (!allowed.includes(m.role)) {
    redirect("/access-error?code=forbidden");
  }
  return m;
}

export const canManageMenu: MembershipRole[] = ["owner", "admin", "manager"];
export const canManageInventory: MembershipRole[] = ["owner", "admin", "manager"];
// Roles allowed to add/edit/delete rooms, areas and tables (structure).
export const canManageTablesStructure: MembershipRole[] = ["owner", "admin", "manager"];
// Roles allowed to change a table's status only (not structure).
export const canUpdateTableStatus: MembershipRole[] = ["owner", "admin", "manager", "cashier", "reception", "staff"];
export const canCreateOrder: MembershipRole[] = ["owner", "admin", "manager", "cashier", "reception"];
export const canPayOrder: MembershipRole[] = ["owner", "admin", "manager", "cashier"];
export const canUpdateKitchen: MembershipRole[] = ["owner", "admin", "manager", "kitchen"];
export const canViewReports: MembershipRole[] = ["owner", "admin", "manager", "cashier"];
export const canGenerateEod: MembershipRole[] = ["owner", "admin", "manager"];
export const canRefreshAnalytics: MembershipRole[] = ["owner", "admin", "manager"];
