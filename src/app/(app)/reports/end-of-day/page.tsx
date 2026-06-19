import { requireActiveContext, canGenerateEod, canViewReports, getActiveMembership } from "@/lib/auth/permissions";
import { computeEod, getOrCreateEodReport } from "@/server/queries/eod";
import { EodReport } from "@/components/reports/eod-report";

export const metadata = { title: "Báo cáo cuối ngày" };

interface PageProps {
  searchParams: { date?: string };
}

export default async function EndOfDayPage({ searchParams }: PageProps) {
  const active = await getActiveMembership();
  if (!active) return null;
  if (!canViewReports.includes(active.role)) {
    return <div className="rounded-md border bg-card p-6 text-sm">Bạn không có quyền truy cập báo cáo.</div>;
  }
  const ctx = await requireActiveContext();
  const today = new Date().toISOString().slice(0, 10);
  const date = searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date) ? searchParams.date : today;
  const [data, savedReport] = await Promise.all([
    computeEod(ctx.branchId, date),
    getOrCreateEodReport(ctx.organizationId, ctx.branchId, date),
  ]);
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Báo cáo cuối ngày</h1>
        <p className="text-sm text-muted-foreground">Tổng kết doanh thu, thanh toán và hủy đơn theo ngày.</p>
      </div>
      <EodReport
        organizationId={ctx.organizationId}
        branchId={ctx.branchId}
        canGenerate={canGenerateEod.includes(active.role)}
        date={date}
        data={data}
        savedReport={savedReport}
      />
    </div>
  );
}
