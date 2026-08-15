import { getActiveMembership, canGenerateEod } from "@/lib/auth/permissions";
import { ReportsTabs } from "@/components/reports/reports-tabs";

export const metadata = { title: "Báo cáo" };

export default async function ReportsLayout({ children }: { children: React.ReactNode }) {
  const active = await getActiveMembership();
  if (!active) return null;
  return (
    <div className="space-y-4">
      <ReportsTabs canDocuments={canGenerateEod.includes(active.role)} />
      {children}
    </div>
  );
}
