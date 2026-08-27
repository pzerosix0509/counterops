import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveMemberships } from "@/lib/auth/permissions";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Đăng ký" };

export default async function RegisterPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    const memberships = await getActiveMemberships();
    if (memberships.length === 0) redirect("/onboarding");
    redirect("/dashboard");
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <RegisterForm />
    </div>
  );
}
