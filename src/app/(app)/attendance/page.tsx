import { requireActiveContext } from "@/lib/auth/permissions";
import { getAttendanceSettings, getAttendanceLogs } from "@/server/actions/attendance";
import { AttendanceClient } from "@/components/attendance/attendance-client";

export const metadata = { title: "Chấm công" };

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export default async function AttendancePage() {
  const context = await requireActiveContext();
  const today = todayStr();

  const [settingsResult, logsResult] = await Promise.all([
    getAttendanceSettings(context.organizationId, context.branchId),
    getAttendanceLogs(context.organizationId, context.branchId, today),
  ]);

  if (!settingsResult.ok) {
    return (
      <div className="rounded-md border bg-card p-6 text-sm text-destructive">
        {settingsResult.error.message}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-muted-foreground">Nhân sự</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Chấm công</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Nhật ký và cài đặt quy tắc chấm công cho chi nhánh.
        </p>
      </div>

      <AttendanceClient
        organizationId={context.organizationId}
        branchId={context.branchId}
        initialSettings={settingsResult.data}
        initialLogs={logsResult.ok ? logsResult.data : []}
        initialDate={today}
      />
    </div>
  );
}