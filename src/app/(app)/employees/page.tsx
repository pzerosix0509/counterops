import { Users } from "lucide-react";
import { requireActiveContext } from "@/lib/auth/permissions";
import { listEmployees } from "@/server/actions/employees";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmployeeManagement } from "@/components/employees/employee-management";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata = { title: "Quản lý nhân viên" };

export default async function EmployeesPage() {
  const context = await requireActiveContext();
  const result = await listEmployees(context.organizationId, context.branchId);
  if (!result.ok) {
    return <div className="rounded-md border bg-card p-6 text-sm text-destructive">{result.error.message}</div>;
  }

  const supabase = createSupabaseServerClient();
  const { data: branches } = await supabase
    .from("branches")
    .select("id, name")
    .eq("organization_id", context.organizationId)
    .eq("is_active", true)
    .order("name");

  const currentBranch = (branches ?? []).find((b) => b.id === context.branchId);

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="h-4 w-4" /> Nhân sự
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Quản lý nhân viên</h1>
          <p className="mt-1 text-sm text-muted-foreground">Hồ sơ và quyền truy cập của nhân viên tại chi nhánh hiện tại.</p>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Danh sách nhân viên</CardTitle>
          <CardDescription>Chi nhánh: {currentBranch?.name ?? "—"}</CardDescription>
        </CardHeader>
        <CardContent>
          <EmployeeManagement
            employees={result.data.employees as never[]}
            roles={result.data.roles as never[]}
            branches={branches ?? []}
            organizationId={context.organizationId}
            currentBranchId={context.branchId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
