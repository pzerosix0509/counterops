"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShiftTemplatesTab } from "./shift-templates-tab";
import { WeeklyScheduleTab } from "./weekly-schedule-tab";
import { ShiftFormDialog } from "./shift-form-dialog";
import { AssignDialog } from "./assign-dialog";
import { getWeeklySchedule } from "@/server/actions/schedules";

export type Shift = {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  is_active: boolean;
  organization_id: string;
  branch_id: string;
};

export type Schedule = {
  id: string;
  employee_id: string;
  shift_id: string;
  work_date: string;
  notes: string | null;
  shift: Shift | null;
  employee: { id: string; full_name: string } | null;
};

export type Employee = {
  id: string;
  full_name: string;
  status: string;
};

interface Props {
  organizationId: string;
  branchId: string;
  initialShifts: Shift[];
  initialSchedules: Schedule[];
  initialStartDate: string;
  employees: Employee[];
}

function getWeekDays(startDate: string): string[] {
  const days: string[] = [];
  const start = new Date(startDate + "T00:00:00");
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function formatTimeHHMM(t: string) {
  return t?.slice(0, 5) ?? t;
}

export function SchedulesClient({
  organizationId,
  branchId,
  initialShifts,
  initialSchedules,
  initialStartDate,
  employees,
}: Props) {
  const router = useRouter();
  const [shifts, setShifts] = useState<Shift[]>(initialShifts);
  const [schedules, setSchedules] = useState<Schedule[]>(initialSchedules);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [pending, startTransition] = useTransition();

  // Shift form dialog
  const [shiftDialog, setShiftDialog] = useState<{
    open: boolean;
    editing: Shift | null;
  }>({ open: false, editing: null });

  // Assign dialog
  const [assignDialog, setAssignDialog] = useState<{
    open: boolean;
    shiftId: string;
    shiftName: string;
    workDate: string;
  } | null>(null);

  const weekDays = getWeekDays(startDate);
  const endDate = weekDays[6];

  const refreshSchedules = useCallback(
    async (start: string, end: string) => {
      const result = await getWeeklySchedule(branchId, organizationId, start, end);
      if (result.ok) setSchedules(result.data as Schedule[]);
    },
    [branchId, organizationId]
  );

  function navigateWeek(direction: -1 | 1) {
    const newStart = addDays(startDate, direction * 7);
    const newEnd = addDays(newStart, 6);
    setStartDate(newStart);
    startTransition(async () => {
      await refreshSchedules(newStart, newEnd);
    });
  }

  function handleShiftSaved(shift: Shift) {
    setShifts((prev) => {
      const exists = prev.findIndex((s) => s.id === shift.id);
      let next = [...prev];
      if (exists >= 0) {
        next[exists] = shift;
      } else {
        next.push(shift);
      }
      // Sort chronologically by start_time
      return next.sort((a, b) => a.start_time.localeCompare(b.start_time));
    });
  }

  function handleScheduleAssigned(schedule: Schedule) {
    setSchedules((prev) => {
      const exists = prev.findIndex((s) => s.id === schedule.id);
      if (exists >= 0) return prev;
      return [...prev, schedule];
    });
  }

  function handleScheduleRemoved(scheduleId: string) {
    setSchedules((prev) => prev.filter((s) => s.id !== scheduleId));
  }

  function handleShiftDeleted(shiftId: string) {
    setShifts((prev) => prev.filter((s) => s.id !== shiftId));
  }

  return (
    <>
      <Tabs defaultValue="templates">
        <TabsList>
          <TabsTrigger value="templates">Cài đặt Ca</TabsTrigger>
          <TabsTrigger value="schedule">Lịch làm việc</TabsTrigger>
        </TabsList>

        {/* Tab 1: Shift Templates */}
        <TabsContent value="templates" className="mt-4">
          <ShiftTemplatesTab
            organizationId={organizationId}
            shifts={shifts}
            onEdit={(shift) => setShiftDialog({ open: true, editing: shift })}
            onAdd={() => setShiftDialog({ open: true, editing: null })}
            onDelete={handleShiftDeleted}
          />
        </TabsContent>

        {/* Tab 2: Weekly Schedule */}
        <TabsContent value="schedule" className="mt-4">
          <WeeklyScheduleTab
            shifts={shifts.filter((s) => s.is_active)}
            schedules={schedules}
            weekDays={weekDays}
            startDate={startDate}
            endDate={endDate}
            navigating={pending}
            onNavigate={navigateWeek}
            onOpenAssign={(shiftId, shiftName, workDate) =>
              setAssignDialog({ open: true, shiftId, shiftName, workDate })
            }
            onRemoveSchedule={handleScheduleRemoved}
            organizationId={organizationId}
          />
        </TabsContent>
      </Tabs>

      {/* Shift Form Dialog */}
      <ShiftFormDialog
        open={shiftDialog.open}
        editing={shiftDialog.editing}
        organizationId={organizationId}
        branchId={branchId}
        onClose={() => setShiftDialog({ open: false, editing: null })}
        onSaved={handleShiftSaved}
      />

      {/* Assign Dialog */}
      {assignDialog && (
        <AssignDialog
          open={assignDialog.open}
          shiftId={assignDialog.shiftId}
          shiftName={assignDialog.shiftName}
          workDate={assignDialog.workDate}
          employees={employees}
          scheduledEmployeeIds={schedules
            .filter(
              (s) =>
                s.shift_id === assignDialog.shiftId &&
                s.work_date === assignDialog.workDate
            )
            .map((s) => s.employee_id)}
          organizationId={organizationId}
          branchId={branchId}
          onClose={() => setAssignDialog(null)}
          onAssigned={handleScheduleAssigned}
        />
      )}
    </>
  );
}
