"use server";

import { onboardingSchema } from "@/lib/validation/schemas";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { ensureStandardRolesAndPermissions } from "@/server/actions/roles";

export async function createOrganizationWithFirstBranch(
  input: unknown
): Promise<ActionResult<{ organizationId: string; branchId: string }>> {
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "");
      if (!fieldErrors[key]) fieldErrors[key] = [];
      fieldErrors[key].push(issue.message);
    }
    return actionFail("VALIDATION_ERROR", "Vui lòng kiểm tra lại các trường.", fieldErrors);
  }
  const data = parsed.data;
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return actionFail("UNAUTHENTICATED", "Bạn cần đăng nhập.");

  const admin = createSupabaseAdminClient();

  const { data: existingProfile } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (!existingProfile) {
    const { error: profileError } = await supabase.from("profiles").insert({
      id: user.id,
      full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    });
    if (profileError) {
      return actionFail("INTERNAL_ERROR", "Không tạo được hồ sơ người dùng: " + profileError.message);
    }
  }

  const { data: slugExists } = await admin.from("organizations").select("id").eq("slug", data.organizationSlug).maybeSingle();
  if (slugExists) {
    return actionFail("CONFLICT", "Mã định danh đã tồn tại, vui lòng chọn mã khác.", { organizationSlug: ["Mã định danh đã tồn tại"] });
  }

  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: data.organizationName,
      slug: data.organizationSlug,
      business_type: data.businessType,
    })
    .select("id")
    .single();
  if (orgErr || !org) return actionFail("INTERNAL_ERROR", "Không tạo được cửa hàng: " + (orgErr?.message ?? "unknown"));

  const { data: branch, error: branchErr } = await admin
    .from("branches")
    .insert({
      organization_id: org.id,
      name: data.branchName,
      address: data.branchAddress ?? null,
      phone: data.branchPhone ?? null,
    })
    .select("id")
    .single();
  if (branchErr || !branch) return actionFail("INTERNAL_ERROR", "Không tạo được chi nhánh: " + (branchErr?.message ?? "unknown"));

  const { error: memberErr } = await admin.from("memberships").insert({
    organization_id: org.id,
    branch_id: null,
    user_id: user.id,
    role: "owner",
    status: "active",
    invited_by: user.id,
    joined_at: new Date().toISOString(),
  });
  if (memberErr) return actionFail("INTERNAL_ERROR", "Không gán được quyền chủ sở hữu: " + memberErr.message);

  await supabase.from("profiles").update({ default_organization_id: org.id }).eq("id", user.id);
  await ensureStandardRolesAndPermissions(org.id);

  const defaultChannels = [
    { organization_id: org.id, name: "Tại quán", type: "direct" },
    { organization_id: org.id, name: "Mang đi", type: "direct" },
    { organization_id: org.id, name: "Grab (Mock)", type: "delivery" },
    { organization_id: org.id, name: "ShopeeFood", type: "delivery" },
    { organization_id: org.id, name: "BeFood", type: "delivery" },
    { organization_id: org.id, name: "Online", type: "online" },
  ];
  await supabase.from("sales_channels").insert(defaultChannels);

  const defaultCategories = [
    { name: "Cà phê", menu_type: "drink" },
    { name: "Trà", menu_type: "drink" },
    { name: "Nước ép", menu_type: "drink" },
    { name: "Chiên", menu_type: "food" },
    { name: "Luộc", menu_type: "food" },
    { name: "Mì", menu_type: "food" },
    { name: "Dịch vụ", menu_type: "service" },
  ].map((c, i) => ({
    organization_id: org.id,
    name: c.name,
    menu_type: c.menu_type,
    sort_order: i + 1,
  }));
  await supabase.from("menu_categories").insert(defaultCategories);

  await supabase.from("audit_logs").insert({
    organization_id: org.id,
    branch_id: branch.id,
    actor_user_id: user.id,
    action: "organization.create",
    entity_type: "organizations",
    entity_id: org.id,
    after: { name: data.organizationName, slug: data.organizationSlug },
  });

  return actionOk({ organizationId: org.id, branchId: branch.id });
}
