import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveMemberships } from "@/lib/auth/permissions";
import { OnboardingForm } from "./onboarding-form";

export const metadata = { title: "Tạo cửa hàng" };

interface PageProps {
  searchParams: { error?: string };
}

export default async function OnboardingPage({ searchParams }: PageProps) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/onboarding");
  if (searchParams.error) redirect(`/access-error?code=${searchParams.error}`);
  const memberships = await getActiveMemberships();
  if (memberships.length > 0) redirect("/dashboard");
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <OnboardingForm
        email={user.email ?? ""}
        userId={user.id}
      />
    </div>
  );
}
