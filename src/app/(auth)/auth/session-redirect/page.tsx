import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRedirectPathForUser } from "@/server/actions/login";

/**
 * Server-side RBAC redirect handler.
 *
 * The client-side login form does window.location.replace("/auth/session-redirect")
 * AFTER supabase.auth.signInWithPassword() has set the session cookies.
 * By the time this server component runs the cookies are already present,
 * so getRedirectPathForUser() can read the session reliably without the
 * "fetch failed / undici" race condition.
 */
export default async function SessionRedirectPage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const result = await getRedirectPathForUser();
  if (!result.ok) {
    redirect("/onboarding");
  }

  redirect(result.data.redirectTo);
}

