import { redirect } from "next/navigation";
import { Toaster } from "sonner";
import { Sidebar } from "@/components/app-shell/sidebar";
import { Topbar } from "@/components/app-shell/topbar";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  getActiveMemberships,
  getActiveOrganizationId,
  getActiveBranchId,
  getCurrentProfile,
} from "@/lib/auth/permissions";
import type { Branch, MembershipRole } from "@/types/database";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profile, memberships, organizationId] = await Promise.all([
    getCurrentProfile(),
    getActiveMemberships(),
    getActiveOrganizationId(),
  ]);
  if (memberships.length === 0) redirect("/onboarding");
  if (!organizationId) redirect("/onboarding");

  const [branchId, branchesResp] = await Promise.all([
    getActiveBranchId(organizationId),
    supabase
      .from("branches")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .order("created_at"),
  ]);

  const active = memberships.find((m) => m.organization.id === organizationId) ?? memberships[0];
  const org = active.organization;
  // branch is read from active but not needed for layout; we use branchId from cookies via permissions
  const branches = branchesResp.data ?? [];

  return (
    <div className="min-h-screen bg-muted/20">
      <Sidebar role={active.role as MembershipRole} organizationName={org.name} />
      <div className="flex min-h-screen flex-col md:pl-[240px]">
        <Topbar
          userEmail={user.email ?? ""}
          userName={profile?.full_name ?? null}
          organizationName={org.name}
          branches={branches.map((b: Branch) => ({ id: b.id, name: b.name }))}
          currentBranchId={branchId}
          role={active.role as MembershipRole}
        />
        <main className="flex-1 px-4 py-4 md:px-6 md:py-6">{children}</main>
        <Toaster richColors closeButton position="top-right" />
      </div>
    </div>
  );
}
