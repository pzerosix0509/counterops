import Link from "next/link";
import { requireActiveContext } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { Button } from "@/components/ui/button";
import { KioskClient } from "@/components/attendance/kiosk-client";

export const metadata = { title: "Kiosk Chấm công" };

export type KioskEmployeeData = {
  id: string;
  full_name: string;
  employee_code: string | null;
  schedule: {
    id: string;
    shift_name: string;
    start_time: string;
    end_time: string;
  } | null;
  activeLog: {
    id: string;
    check_in_time: string;
  } | null;
};

export default async function KioskPage() {
  const context = await requireActiveContext();
  const admin = createSupabaseAdminClient();

  const { data: employees, error: empError } = await admin
    .from("employees")
    .select("id, full_name, employee_code")
    .eq("organization_id", context.organizationId)
    .eq("branch_id", context.branchId)
    .eq("status", "ACTIVE")
    .order("full_name");

  if (empError) console.error("Kiosk Employee Fetch Error:", empError);

  const todayDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const { data: schedules, error: schedError } = await admin
    .from("employee_schedules")
    .select("id, employee_id, shift:shifts!inner(name, start_time, end_time)")
    .eq("branch_id", context.branchId)
    .eq("work_date", todayDate);

  if (schedError) console.error("Kiosk Schedules Fetch Error:", schedError);

  const { data: logs, error: logsError } = await admin
    .from("attendance_logs")
    .select("id, employee_id, check_in_time")
    .eq("organization_id", context.organizationId)
    .eq("branch_id", context.branchId)
    .is("check_out_time", null);

  if (logsError) console.error("Kiosk Logs Fetch Error:", logsError);

  const nowTimeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date()).split(":");
  const nowMinutes = parseInt(nowTimeParts[0], 10) * 60 + parseInt(nowTimeParts[1], 10);

  type ScheduleRow = {
    id: string;
    employee_id: string;
    shift: { name: string; start_time: string; end_time: string };
  };

  const typedSchedules = ((schedules ?? []) as unknown[]).filter((s): s is ScheduleRow => {
    const row = s as ScheduleRow;
    return !!row.shift && !Array.isArray(row.shift);
  });

  function timeToMinutes(t: string): number {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  }

  function pickBestSchedule(empSchedules: ScheduleRow[]): ScheduleRow | undefined {
    if (empSchedules.length === 0) return undefined;
    if (empSchedules.length === 1) return empSchedules[0];

    const candidates = empSchedules.filter((s) => {
      const endMin = timeToMinutes(s.shift.end_time);
      const startMin = timeToMinutes(s.shift.start_time);
      const isOvernight = endMin <= startMin;
      if (isOvernight) {
        return nowMinutes >= startMin || nowMinutes < endMin;
      }
      return nowMinutes < endMin;
    });

    const pool = candidates.length > 0 ? candidates : empSchedules;

    return pool.reduce<ScheduleRow | undefined>((best, s) => {
      if (!best) return s;
      const bestDiff = (timeToMinutes(best.shift.start_time) - nowMinutes + 1440) % 1440;
      const sDiff = (timeToMinutes(s.shift.start_time) - nowMinutes + 1440) % 1440;
      return sDiff < bestDiff ? s : best;
    }, undefined);
  }

  const employeeDataList: KioskEmployeeData[] = (employees || []).map((emp) => {
    const empSchedules = typedSchedules.filter((s) => s.employee_id === emp.id);
    const empSched = pickBestSchedule(empSchedules);
    const activeLog = (logs || []).find((l) => l.employee_id === emp.id);

    return {
      id: emp.id,
      full_name: emp.full_name,
      employee_code: emp.employee_code,
      schedule: empSched
        ? {
            id: empSched.id,
            shift_name: empSched.shift.name,
            start_time: empSched.shift.start_time,
            end_time: empSched.shift.end_time,
          }
        : null,
      activeLog: activeLog
        ? {
            id: activeLog.id,
            check_in_time: activeLog.check_in_time,
          }
        : null,
    };
  });

  employeeDataList.sort((a, b) => {
    if (a.schedule && !b.schedule) return -1;
    if (!a.schedule && b.schedule) return 1;
    return a.full_name.localeCompare(b.full_name);
  });

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center border-b px-4 gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/attendance">
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Quay lại
          </Link>
        </Button>
        <h1 className="text-base font-semibold">Chấm công - Kiosk</h1>
      </header>

      <main className="flex-1 p-6">
        <KioskClient
          employees={employeeDataList}
          organizationId={context.organizationId}
          branchId={context.branchId}
        />
      </main>
    </div>
  );
}