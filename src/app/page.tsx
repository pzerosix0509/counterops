import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function HomePage() {
  if (process.env.NEXT_PUBLIC_MOCK === "true") {
    // If is on mock version, then redirect to /login
    // instead of checking whether there is a valid user and choose to
    // redirect to /login or dashboard
    redirect("/login");
  }
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  redirect("/dashboard");
}
