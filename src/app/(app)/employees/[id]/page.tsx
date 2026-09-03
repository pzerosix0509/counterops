import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, User, Briefcase, Phone, Mail, Building, Tag, CalendarIcon } from "lucide-react";

import { requireActiveContext } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getEmployeeSalaryProfile } from "@/server/actions/payroll";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SalaryProfileTab } from "@/components/employees/salary-profile-tab";

export const metadata = { title: "Chi tiết nhân viên" };

export default async function EmployeeDetailsPage({ params }: { params: { id: string } }) {
  const context = await requireActiveContext();
  const supabase = createSupabaseServerClient();

  const employeeId = decodeURIComponent(params.id);

  // Fetch employee details
  let { data: employeeRaw, error } = await supabase
    .from("employees")
    .select("*, branch:branches(name), role:roles(name)")
    .maybeSingle();

  if (error) {
    console.error("Employee fetch error with server client:", error);
  }

  // Fallback to admin client if RLS is preventing the server client from reading
  if (!employeeRaw) {
    const admin = createSupabaseAdminClient();
    const { data: adminEmployee, error: adminError } = await admin
      .from("employees")
      .select("*, branch:branches(name), role:roles(name)")
      .eq("id", employeeId)

    if (adminError) {
      console.error("Employee fetch error with admin client:", adminError);
    } else if (adminEmployee) {
      console.log("Employee found via admin client (RLS was hiding it from server client):", adminEmployee.id);
      employeeRaw = adminEmployee;
    }
  }

  if (!employeeRaw || employeeRaw.organization_id !== context.organizationId) {
    console.error("Employee not found or organization mismatch for ID:", employeeId);
    notFound();
  }
  const employee = employeeRaw as any;
  const branchName = Array.isArray(employee.branch) ? employee.branch[0]?.name : employee.branch?.name;
  const roleName = Array.isArray(employee.role) ? employee.role[0]?.name : employee.role?.name;

  // Fetch salary profile
  const salaryResult = await getEmployeeSalaryProfile(employeeId);
  const salaryProfile = salaryResult.ok ? salaryResult.data : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="outline" size="icon" asChild>
          <Link href="/employees">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{employee.full_name}</h1>
          <p className="text-muted-foreground text-sm">
            Mã NV: {employee.employee_code || "Chưa cấp"}
          </p>
        </div>
      </div>

      <Tabs defaultValue="info" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="info">Thông tin cá nhân</TabsTrigger>
          <TabsTrigger value="salary">Hồ sơ lương</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>Thông tin hồ sơ</CardTitle>
              <CardDescription>Chi tiết thông tin liên hệ và công việc của nhân viên.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3">
                <User className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Họ và tên</span>
                  <span className="text-sm text-muted-foreground">{employee.full_name}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Số điện thoại</span>
                  <span className="text-sm text-muted-foreground">{employee.phone_number || "Không có"}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Email</span>
                  <span className="text-sm text-muted-foreground">{employee.email || "Không có"}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Tag className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Vai trò</span>
                  <span className="text-sm text-muted-foreground">{roleName || "Không có"}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Building className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Chi nhánh</span>
                  <span className="text-sm text-muted-foreground">{branchName || "Không có"}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Trạng thái</span>
                  <span className="text-sm text-muted-foreground">
                    {employee.status === "ACTIVE" ? "Đang làm việc" : employee.status === "INACTIVE" ? "Tạm nghỉ" : "Đã nghỉ việc"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">Ngày bắt đầu</span>
                  <span className="text-sm text-muted-foreground">{employee.start_date}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="salary">
          <SalaryProfileTab 
            employeeId={employee.id} 
            organizationId={context.organizationId} 
            initialProfile={salaryProfile} 
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}