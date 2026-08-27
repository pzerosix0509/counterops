import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { LandingPage } from "@/components/marketing/LandingPage";

export const metadata = {
  title: "Quản lý cửa hàng",
  description:
    "Phần mềm quản lý quán ăn, cà phê, nhà hàng: bán hàng POS, điều phối bếp, quản lý bàn, kho hàng và báo cáo doanh thu.",
};

export default async function HomePage() {
  const supabase = createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");
  return <LandingPage />;
}
