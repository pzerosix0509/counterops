import Link from "next/link";
import { Users } from "lucide-react";
import { requireActiveContext } from "@/lib/auth/permissions";
import { listEmployees } from "@/server/actions/employees";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeManagement } from "@/components/settings/employee-management";

export const metadata = { title: "Quản lý nhân viên" };

export default async function EmployeesPage() {
  const context = await requireActiveContext();
  const result = await listEmployees(context.organizationId, context.branchId);
  if (!result.ok) {
    return <div className="rounded-md border bg-card p-6 text-sm text-destructive">{result.error.message}</div>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Users className="h-4 w-4" /> Nhân sự</div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Quản lý nhân viên</h1>
          <p className="mt-1 text-sm text-muted-foreground">Hồ sơ và quyền truy cập của nhân viên tại chi nhánh hiện tại.</p>
        </div>
        <Button asChild variant="outline"><Link href="/settings">Về cài đặt</Link></Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Danh sách nhân viên</CardTitle>
          <CardDescription>Chi nhánh đang chọn: {context.branchId}</CardDescription>
        </CardHeader>
        <CardContent>
          <EmployeeManagement employees={result.data.employees as never[]} roles={result.data.roles as never[]} organizationId={context.organizationId} branchId={context.branchId} />
        </CardContent>
      </Card>
    </div>
  );
}