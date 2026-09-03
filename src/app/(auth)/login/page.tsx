import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getRedirectPathForUser } from "@/server/actions/login";
import { LoginForm } from "./login-form";

export const metadata = { title: "Đăng nhập" };

interface PageProps {
  searchParams: { next?: string };
}

export default async function LoginPage({ searchParams }: PageProps) {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    if (searchParams.next) {
      redirect(searchParams.next);
    }
    const redirectResult = await getRedirectPathForUser();
    if (redirectResult.ok) {
      redirect(redirectResult.data.redirectTo);
    }
    redirect("/onboarding");
  }

  return <LoginForm nextPath={searchParams.next || ""} />;
}
