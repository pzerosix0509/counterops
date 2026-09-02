import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireActiveContext } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { KioskClient } from "@/components/attendance/kiosk-client";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Kiosk - Chấm công" };

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

  // 1. Fetch active employees
  const { data: employees, error: empError } = await admin
    .from("employees")
    .select("id, full_name, employee_code")
    .eq("organization_id", context.organizationId)
    .eq("branch_id", context.branchId)
    .eq("status", "ACTIVE")
    .order("full_name");

  if (empError) console.error("Kiosk Employee Fetch Error:", empError);

  // 2. Fetch today's schedules strictly in local timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const todayDate = formatter.format(new Date());
  
  const { data: schedules, error: schedError } = await admin
    .from("employee_schedules")
    .select("id, employee_id, shift:shifts!inner(name, start_time, end_time)")
    .eq("branch_id", context.branchId)
    .eq("work_date", todayDate);

  if (schedError) console.error("Kiosk Schedules Fetch Error:", schedError);

  // 3. Fetch active logs (where check_out_time is null)
  const { data: logs, error: logsError } = await admin
    .from("attendance_logs")
    .select("id, employee_id, check_in_time")
    .eq("organization_id", context.organizationId)
    .eq("branch_id", context.branchId)
    .is("check_out_time", null);

  if (logsError) console.error("Kiosk Logs Fetch Error:", logsError);

  // 4. Compute current time in minutes from midnight (Asia/Ho_Chi_Minh)
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

  // Cast to typed array (Supabase infers joined relation as array; we know it's !inner so always present)
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

    // Build candidates: shifts that have not yet ended
    const candidates = empSchedules.filter((s) => {
      const endMin = timeToMinutes(s.shift.end_time);
      const startMin = timeToMinutes(s.shift.start_time);
      const isOvernight = endMin <= startMin;
      if (isOvernight) {
        // Overnight: valid if current time is after start OR before end (next day)
        return nowMinutes >= startMin || nowMinutes < endMin;
      }
      return nowMinutes < endMin;
    });

    const pool = candidates.length > 0 ? candidates : empSchedules;

    // Among the pool, pick the shift whose start_time is closest to now
    // using circular distance (so "upcoming" is preferred over "just passed")
    return pool.reduce<ScheduleRow | undefined>((best, s) => {
      if (!best) return s;
      const bestDiff = (timeToMinutes(best.shift.start_time) - nowMinutes + 1440) % 1440;
      const sDiff = (timeToMinutes(s.shift.start_time) - nowMinutes + 1440) % 1440;
      return sDiff < bestDiff ? s : best;
    }, undefined);
  }

  // 5. Combine into KioskEmployeeData
  const employeeDataList: KioskEmployeeData[] = (employees || []).map((emp) => {
    // Get all schedules for this employee today
    const empSchedules = typedSchedules.filter((s) => s.employee_id === emp.id);
    // Pick the most relevant schedule based on current time
    const empSched = pickBestSchedule(empSchedules);
    // Find active log
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

  // Sort: scheduled first, then by full_name
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
