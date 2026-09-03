import { requireActiveContext } from "@/lib/auth/permissions";
import { getShifts, getWeeklySchedule } from "@/server/actions/schedules";
import { listEmployees } from "@/server/actions/employees";
import { SchedulesClient } from "@/components/schedules/schedules-client";

export const metadata = { title: "Quản lý ca làm việc" };

function getWeekBounds(date: Date): { start: Date; end: Date } {
  const day = date.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const start = new Date(date);
  start.setDate(date.getDate() + diffToMon);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start, end };
}

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function SchedulesPage() {
  const context = await requireActiveContext();

  const today = new Date();
  const { start, end } = getWeekBounds(today);
  const startDate = toDateStr(start);
  const endDate = toDateStr(end);

  const [shiftsResult, scheduleResult, employeesResult] = await Promise.all([
    getShifts(context.branchId, context.organizationId),
    getWeeklySchedule(context.branchId, context.organizationId, startDate, endDate),
    listEmployees(context.organizationId, context.branchId),
  ]);

  if (!shiftsResult.ok) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-destructive">
        {shiftsResult.error.message}
      </div>
    );
  }

  const shifts = shiftsResult.data ?? [];
  const schedules = scheduleResult.ok ? scheduleResult.data : [];
  const employees = employeesResult.ok
    ? (employeesResult.data.employees as any[]).filter((e) => e.status === "ACTIVE")
    : [];

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Nhân sự</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Ca làm việc</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cài đặt ca và xếp lịch làm việc cho nhân viên tại chi nhánh.
        </p>
      </div>

      <SchedulesClient
        organizationId={context.organizationId}
        branchId={context.branchId}
        initialShifts={shifts}
        initialSchedules={schedules}
        initialStartDate={startDate}
        employees={employees}
      />
    </div>
  );
}
