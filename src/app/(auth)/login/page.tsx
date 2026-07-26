import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveMemberships } from "@/lib/auth/permissions";
import { LoginForm } from "./login-form";

export const metadata = { title: "Đăng nhập" };

interface PageProps {
  searchParams: { next?: string };
}

export default async function LoginPage({ searchParams }: PageProps) {
  if (process.env.NEXT_PUBLIC_MOCK !== "true") {
    const supabase = createSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const memberships = await getActiveMemberships();
      if (memberships.length === 0) redirect("/onboarding");
      redirect(searchParams.next || "/dashboard");
    }
  }
  // If not in mock version, then return a login page with
  // a Demo Mode indicator
  // and redirect to /dashboard after click into the login button
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      {process.env.NEXT_PUBLIC_MOCK === "true" && (
        <div className="fixed top-4 right-4 rounded-md bg-amber-100 border border-amber-300 px-3 py-1.5 text-sm text-amber-800">
          Demo Mode — enter any credentials to login
        </div>
      )}
      <LoginForm nextPath={searchParams.next || "/dashboard"} />
    </div>
  );
}
