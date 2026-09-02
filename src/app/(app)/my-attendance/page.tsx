import { requireActiveContext } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { PersonalAttendanceClient } from "@/components/attendance/personal-attendance-client";

export const metadata = { title: "Chấm công của tôi" };
function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

type ShiftRow = { name: string; start_time: string; end_time: string };
type ScheduleRow = { id: string; shift: ShiftRow };

function pickBestSchedule(schedules: ScheduleRow[], nowMinutes: number): ScheduleRow | undefined {
  if (schedules.length === 0) return undefined;
  if (schedules.length === 1) return schedules[0];

  const candidates = schedules.filter((s) => {
    const endMin = timeToMinutes(s.shift.end_time);
    const startMin = timeToMinutes(s.shift.start_time);
    const isOvernight = endMin <= startMin;
    if (isOvernight) return nowMinutes >= startMin || nowMinutes < endMin;
    return nowMinutes < endMin;
  });

  const pool = candidates.length > 0 ? candidates : schedules;
  return pool.reduce<ScheduleRow | undefined>((best, s) => {
    if (!best) return s;
    const bestDiff = (timeToMinutes(best.shift.start_time) - nowMinutes + 1440) % 1440;
    const sDiff = (timeToMinutes(s.shift.start_time) - nowMinutes + 1440) % 1440;
    return sDiff < bestDiff ? s : best;
  }, undefined);
}

export type PersonalAttendanceData = {
  employee: {
    id: string;
    full_name: string;
    employee_code: string | null;
  };
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
  organizationId: string;
  branchId: string;
};

export default async function MyAttendancePage() {
  const context = await requireActiveContext();
  const admin = createSupabaseAdminClient();

  // 1. Find employee record linked to this user
  const { data: employee } = await admin
    .from("employees")
    .select("id, full_name, employee_code")
    .eq("organization_id", context.organizationId)
    .eq("branch_id", context.branchId)
    .eq("user_id", context.userId)
    .maybeSingle();

  if (!employee) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg font-medium">Tài khoản chưa được thiết lập</p>
        <p className="text-sm text-muted-foreground max-w-sm">
          Vui lòng liên hệ Quản lý để được hỗ trợ.
        </p>
      </div>

  // 2. Today date in local timezone
  const todayDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  // 3. Current time in minutes for schedule selection
  const nowTimeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date()).split(":");
  const nowMinutes = parseInt(nowTimeParts[0], 10) * 60 + parseInt(nowTimeParts[1], 10);

  // 4. Fetch today's schedules for this employee
  const { data: schedulesRaw, error: schedError } = await admin
    .from("employee_schedules")
    .select("id, shift:shifts!inner(name, start_time, end_time)")
    .eq("organization_id", context.organizationId)
    .eq("branch_id", context.branchId)
    .eq("employee_id", employee.id)
    .eq("work_date", todayDate);

  if (schedError) console.error("MyAttendance schedule error:", schedError);

  const typedSchedules: ScheduleRow[] = ((schedulesRaw ?? []) as unknown[]).filter(
    (s): s is ScheduleRow => {
      const row = s as ScheduleRow;
      return !!row.shift && !Array.isArray(row.shift);
    }
  );

  const bestSchedule = pickBestSchedule(typedSchedules, nowMinutes);

  // 5. Fetch active log
  const { data: activeLogRaw } = await admin
    .from("attendance_logs")
    .select("id, check_in_time")
    .eq("organization_id", context.organizationId)
    .eq("branch_id", context.branchId)
    .eq("employee_id", employee.id)
    .is("check_out_time", null)
    .maybeSingle();

  const pageData: PersonalAttendanceData = {
    employee: {
      id: employee.id,
      full_name: employee.full_name,
      employee_code: employee.employee_code ?? null,
    },
    schedule: bestSchedule
      ? {
          id: bestSchedule.id,
          shift_name: bestSchedule.shift.name,
          start_time: bestSchedule.shift.start_time,
          end_time: bestSchedule.shift.end_time,
        }
      : null,
    activeLog: activeLogRaw
      ? { id: activeLogRaw.id, check_in_time: activeLogRaw.check_in_time }
      : null,
    organizationId: context.organizationId,
    branchId: context.branchId,
  };

  return <PersonalAttendanceClient data={pageData} />;
}