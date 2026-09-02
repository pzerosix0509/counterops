"use server";

import { revalidatePath } from "next/cache";
import { getMembershipForOrg, requireUser } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";

// ============================================================
// Types
// ============================================================

export type AttendanceSettings = {
  branch_id: string;
  organization_id: string;
  standard_hours_per_day: number;
  half_day_hours_threshold: number;
  half_day_range_from: string | null;
  half_day_range_to: string | null;
  record_late_early_on_half_day: boolean;
  late_threshold_minutes: number;
  early_leave_threshold_minutes: number;
  overtime_before_shift_enabled: boolean;
  overtime_after_shift_enabled: boolean;
  allow_continuous_shift_checkin: boolean;
  auto_attendance_enabled: boolean;
  allow_checkin_without_schedule: boolean;
  updated_at: string;
};

export type AttendanceLog = {
  id: string;
  organization_id: string;
  branch_id: string;
  employee_id: string;
  schedule_id: string | null;
  check_in_time: string;
  check_out_time: string | null;
  method: "QR_MINI_APP" | "FINGERPRINT" | "AUTO" | "MANUAL";
  is_late: boolean;
  is_early_leave: boolean;
  overtime_before_minutes: number;
  overtime_after_minutes: number;
  work_unit: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const DEFAULT_SETTINGS: Omit<AttendanceSettings, "branch_id" | "organization_id" | "updated_at"> = {
  standard_hours_per_day: 8,
  half_day_hours_threshold: 4,
  half_day_range_from: null,
  half_day_range_to: null,
  record_late_early_on_half_day: false,
  late_threshold_minutes: 15,
  early_leave_threshold_minutes: 15,
  overtime_before_shift_enabled: false,
  overtime_after_shift_enabled: false,
  allow_continuous_shift_checkin: false,
  auto_attendance_enabled: false,
  allow_checkin_without_schedule: false,
};

// ============================================================
// Permission Helper
// ============================================================

const manageRoles = ["owner", "admin"] as const;

async function requireManagePermission(organizationId: string): Promise<
  | { ok: true }
  | { ok: false; error: ReturnType<typeof actionFail> }
> {
  const membership = await getMembershipForOrg(organizationId);
  if (!membership) return { ok: false, error: actionFail("FORBIDDEN", "Bạn không thuộc tổ chức này.") };
  if (manageRoles.includes(membership.role as (typeof manageRoles)[number])) return { ok: true };
  const admin = createSupabaseAdminClient();
  const { data } = await admin.rpc("has_employee_permission", { p_org_id: organizationId, p_permission_key: "EMPLOYEE_EDIT" });
  if (!data) return { ok: false, error: actionFail("FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.") };
  return { ok: true };
}

// ============================================================
// getAttendanceSettings
// Fetch settings for a branch; inserts default row if not yet created.
// ============================================================
export async function getAttendanceSettings(
  organizationId: string,
  branchId: string
): Promise<ActionResult<AttendanceSettings>> {
  await requireUser();
  const membership = await getMembershipForOrg(organizationId);
  if (!membership) return actionFail("FORBIDDEN", "Bạn không có quyền truy cập.");

  const admin = createSupabaseAdminClient();

  const { data, error } = await admin
    .from("attendance_settings")
    .select("*")
    .eq("branch_id", branchId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error) {
    console.error("Error fetching attendance settings:", error);
    return actionFail("INTERNAL_ERROR", "Không thể tải cài đặt chấm công.");
  }

  if (data) return actionOk(data as AttendanceSettings);

  // No row yet — insert defaults and return them
  const newSettings = {
    branch_id: branchId,
    organization_id: organizationId,
    ...DEFAULT_SETTINGS,
  };
  const { data: inserted, error: insertError } = await admin
    .from("attendance_settings")
    .insert(newSettings)
    .select()
    .single();

  if (insertError) {
    // Row may have been concurrently inserted — try reading again
    const { data: retry } = await admin
      .from("attendance_settings")
      .select("*")
      .eq("branch_id", branchId)
      .eq("organization_id", organizationId)
      .single();
    if (retry) return actionOk(retry as AttendanceSettings);
    console.error("Error inserting default attendance settings:", insertError);
    return actionFail("INTERNAL_ERROR", "Không thể khởi tạo cài đặt chấm công mặc định.");
  }

  return actionOk(inserted as AttendanceSettings);
}

// ============================================================
// updateAttendanceSettings
// ============================================================
export async function updateAttendanceSettings(
  data: Partial<Omit<AttendanceSettings, "branch_id" | "organization_id" | "updated_at">> & {
    branch_id: string;
    organization_id: string;
  }
): Promise<ActionResult<AttendanceSettings>> {
  const perm = await requireManagePermission(data.organization_id);
  if (!perm.ok) return perm.error;

  const admin = createSupabaseAdminClient();
  const { data: updated, error } = await admin
    .from("attendance_settings")
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq("branch_id", data.branch_id)
    .eq("organization_id", data.organization_id)
    .select()
    .single();

  if (error) {
    console.error("Error updating attendance settings:", error);
    return actionFail("INTERNAL_ERROR", "Không thể cập nhật cài đặt chấm công.");
  }
  revalidatePath("/attendance");
  return actionOk(updated as AttendanceSettings);
}

// ============================================================
// getEmployeeActiveLog
// Returns the current open (not yet checked-out) log for an employee.
// ============================================================
export async function getEmployeeActiveLog(
  organizationId: string,
  branchId: string,
  employeeId: string
): Promise<ActionResult<AttendanceLog | null>> {
  await requireUser();
  const membership = await getMembershipForOrg(organizationId);
  if (!membership) return actionFail("FORBIDDEN", "Bạn không có quyền truy cập.");

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("attendance_logs")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .eq("employee_id", employeeId)
    .is("check_out_time", null)
    .maybeSingle();

  if (error) {
    console.error("Error fetching active log:", error);
    return actionFail("INTERNAL_ERROR", "Không thể kiểm tra trạng thái chấm công.");
  }
  return actionOk(data as AttendanceLog | null);
}

// ============================================================
// checkIn
// Creates a new attendance log for an employee.
// Enforces: no double check-in if allow_continuous_shift_checkin is false.
// ============================================================
export async function checkIn(
  organizationId: string,
  branchId: string,
  employeeId: string,
  scheduleId?: string,
  method: AttendanceLog["method"] = "MANUAL",
  notes?: string
): Promise<ActionResult<AttendanceLog>> {
  await requireUser();
  const membership = await getMembershipForOrg(organizationId);
  if (!membership) return actionFail("FORBIDDEN", "Bạn không có quyền truy cập.");

  const admin = createSupabaseAdminClient();

  // Fetch settings to apply rules
  const settingsResult = await getAttendanceSettings(organizationId, branchId);
  if (!settingsResult.ok) return settingsResult;
  const settings = settingsResult.data;

  // Check for existing active log
  const activeResult = await getEmployeeActiveLog(organizationId, branchId, employeeId);
  if (!activeResult.ok) return activeResult;

  if (activeResult.data !== null && !settings.allow_continuous_shift_checkin) {
    return actionFail(
      "CONFLICT",
      "Nhân viên này đang có ca chấm công chưa kết thúc. Vui lòng chấm ra trước khi chấm vào ca mới."
    );
  }

  // Compute is_late from schedule if provided
  let is_late = false;
  if (scheduleId) {
    const { data: schedule } = await admin
      .from("employee_schedules")
      .select("*, shift:shifts(start_time)")
      .eq("id", scheduleId)
      .single();

    if (schedule?.shift) {
      const shift = schedule.shift as { start_time: string };
      const [sh, sm] = shift.start_time.split(":").map(Number);
      const scheduledStart = new Date();
      scheduledStart.setHours(sh, sm, 0, 0);
      const now = new Date();
      const lateMs = now.getTime() - scheduledStart.getTime();
      if (lateMs > settings.late_threshold_minutes * 60 * 1000) {
        is_late = true;
      }
    }
  }

  const { data, error } = await admin
    .from("attendance_logs")
    .insert({
      organization_id: organizationId,
      branch_id: branchId,
      employee_id: employeeId,
      schedule_id: scheduleId ?? null,
      check_in_time: new Date().toISOString(),
      method,
      is_late,
      notes: notes ?? null,
    })
    .select()
    .single();

  if (error) {
    console.error("Error during check-in:", error);
    if (error.code === "23505") {
      return actionFail("CONFLICT", "Nhân viên này đã có phiên chấm công đang mở.");
    }
    return actionFail("INTERNAL_ERROR", "Không thể thực hiện chấm vào.");
  }
  revalidatePath("/attendance");
  return actionOk(data as AttendanceLog);
}

// ============================================================
// checkOut
// Finalises a log by setting check_out_time.
// Computes is_early_leave and overtime_after_minutes from the linked schedule.
// ============================================================
export async function checkOut(
  organizationId: string,
  branchId: string,
  logId: string
): Promise<ActionResult<AttendanceLog>> {
  await requireUser();
  const membership = await getMembershipForOrg(organizationId);
  if (!membership) return actionFail("FORBIDDEN", "Bạn không có quyền truy cập.");

  const admin = createSupabaseAdminClient();

  // Fetch the log with its linked schedule/shift for computation
  const { data: log, error: logErr } = await admin
    .from("attendance_logs")
    .select("*, schedule:employee_schedules(shift:shifts(start_time, end_time))")
    .eq("id", logId)
    .eq("organization_id", organizationId)
    .is("check_out_time", null)
    .single();

  if (logErr || !log) {
    return actionFail("NOT_FOUND", "Không tìm thấy phiên chấm công đang mở.");
  }

  const settingsResult = await getAttendanceSettings(organizationId, branchId);
  if (!settingsResult.ok) return settingsResult;
  const settings = settingsResult.data;

  const now = new Date();
  let is_early_leave = false;
  let overtime_after_minutes = 0;

  const schedule = log.schedule as { shift: { start_time: string; end_time: string } } | null;
  if (schedule?.shift) {
    const [eh, em] = schedule.shift.end_time.split(":").map(Number);
    const scheduledEnd = new Date();
    scheduledEnd.setHours(eh, em, 0, 0);
    const diffMs = now.getTime() - scheduledEnd.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < -settings.early_leave_threshold_minutes) {
      is_early_leave = true;
    }
    if (settings.overtime_after_shift_enabled && diffMinutes > 0) {
      overtime_after_minutes = diffMinutes;
    }
  }

  // Compute work_unit from actual hours worked
  const checkInTime = new Date(log.check_in_time);
  const workedMs = now.getTime() - checkInTime.getTime();
  const workedHours = workedMs / (1000 * 60 * 60);

  let work_unit: number;
  if (workedHours >= settings.standard_hours_per_day) {
    work_unit = 1;
  } else if (workedHours >= settings.half_day_hours_threshold) {
    work_unit = 0.5;
  } else {
    work_unit = 0;
  }

  const { data: updated, error: updateErr } = await admin
    .from("attendance_logs")
    .update({
      check_out_time: now.toISOString(),
      is_early_leave,
      overtime_after_minutes,
      work_unit,
      updated_at: now.toISOString(),
    })
    .eq("id", logId)
    .eq("organization_id", organizationId)
    .select()
    .single();

  if (updateErr) {
    console.error("Error during check-out:", updateErr);
    return actionFail("INTERNAL_ERROR", "Không thể thực hiện chấm ra.");
  }
  revalidatePath("/attendance");
  return actionOk(updated as AttendanceLog);
}

// ============================================================
// getAttendanceLogs
// Manager query: all logs for a given date, joined with employee & shift.
// ============================================================
export type AttendanceLogWithDetails = AttendanceLog & {
  employee: { id: string; full_name: string; employee_code: string | null } | null;
  schedule: {
    shift: { name: string; start_time: string; end_time: string } | null;
  } | null;
};

export async function getAttendanceLogs(
  organizationId: string,
  branchId: string,
  date: string // "YYYY-MM-DD"
): Promise<ActionResult<AttendanceLogWithDetails[]>> {
  await requireUser();
  const membership = await getMembershipForOrg(organizationId);
  if (!membership) return actionFail("FORBIDDEN", "Ban khong co quyen truy cap.");

  const admin = createSupabaseAdminClient();

  // Build date range in UTC that covers the full local day
  const dayStart = `${date}T00:00:00`;
  const dayEnd   = `${date}T23:59:59.999`;

  const { data, error } = await admin
    .from("attendance_logs")
    .select(
      "*, employee:employees(id, full_name, employee_code), schedule:employee_schedules(shift:shifts(name, start_time, end_time))"
    )
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .gte("check_in_time", dayStart)
    .lte("check_in_time", dayEnd)
    .order("check_in_time", { ascending: false });

  if (error) {
    console.error("Error fetching attendance logs:", error);
    return actionFail("INTERNAL_ERROR", "Khong the tai nhat ky cham cong.");
  }
  return actionOk(data as AttendanceLogWithDetails[]);
}
