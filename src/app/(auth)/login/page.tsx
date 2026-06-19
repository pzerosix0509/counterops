import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveMemberships } from "@/lib/auth/permissions";
import { LoginForm } from "./login-form";

export const metadata = { title: "Đăng nhập" };

interface PageProps {
  searchParams: { next?: string };
}

export default async function LoginPage({ searchParams }: PageProps) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const memberships = await getActiveMemberships();
    if (memberships.length === 0) redirect("/onboarding");
    redirect(searchParams.next || "/dashboard");
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <LoginForm nextPath={searchParams.next || "/dashboard"} />
    </div>
  );
}
