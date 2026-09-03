import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ChangePasswordForm } from "./change-password-form";

export const metadata = { title: "Đổi mật khẩu" };

export default async function ChangePasswordPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  // Verify the flag is actually set — if not, they have no business here
  const { data: profile } = await supabase
    .from("profiles")
    .select("force_password_reset")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile?.force_password_reset) {
    redirect("/auth/session-redirect");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <ChangePasswordForm />
    </div>
  );
}

