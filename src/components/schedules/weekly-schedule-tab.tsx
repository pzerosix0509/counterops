"use client";

import { useState } from "react";
import { X, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { removeSchedule } from "@/server/actions/schedules";
import type { Shift, Schedule } from "./schedules-client";

interface Props {
  shifts: Shift[];
  schedules: Schedule[];
  weekDays: string[];
  startDate: string;
  endDate: string;
  navigating: boolean;
  onNavigate: (dir: -1 | 1) => void;
  onOpenAssign: (shiftId: string, shiftName: string, workDate: string) => void;
  onRemoveSchedule: (scheduleId: string) => void;
  organizationId: string;
}

const VI_DAY_NAMES = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function formatDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getDate()}/${d.getMonth() + 1}`;
}

function formatDateRange(start: string, end: string) {
  const s = new Date(start + "T00:00:00");
  const e = new Date(end + "T00:00:00");
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" };
  return `${s.toLocaleDateString("vi-VN", opts)} - ${e.toLocaleDateString("vi-VN", opts)}`;
}

function isToday(dateStr: string) {
  return new Date().toISOString().slice(0, 10) === dateStr;
}

export function WeeklyScheduleTab({
  shifts,
  schedules,
  weekDays,
  startDate,
  endDate,
  navigating,
  onNavigate,
  onOpenAssign,
  onRemoveSchedule,
  organizationId,
}: Props) {
  const [removingId, setRemovingId] = useState<string | null>(null);

  async function handleRemove(scheduleId: string) {
    setRemovingId(scheduleId);
    const result = await removeSchedule(organizationId, scheduleId);
    setRemovingId(null);
    if (!result.ok) {
      toast.error(result.error.message);
    } else {
      onRemoveSchedule(scheduleId);
    }
  }

  const getAssignees = (shiftId: string, date: string) =>
    schedules.filter((s) => s.shift_id === shiftId && s.work_date === date);

  return (
    <Card>
      <CardContent className="p-4">
        {/* Week navigation header */}
        <div className="mb-4 flex items-center justify-between gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate(-1)}
            disabled={navigating}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-muted-foreground">
            {formatDateRange(startDate, endDate)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onNavigate(1)}
            disabled={navigating}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {shifts.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Chưa có ca nào được kích hoạt. Hãy tạo ca ở tab &quot;Cài đặt Ca&quot;.
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Grid: col1 = shift label, col2-8 = Mon-Sun */}
            <div
              className="grid min-w-[720px]"
              style={{ gridTemplateColumns: "160px repeat(7, 1fr)" }}
            >
              {/* Header row */}
              <div className="border-b border-r bg-muted/40 px-3 py-2 text-xs font-semibold text-muted-foreground">
                Ca / Ngày
              </div>
              {weekDays.map((day, i) => (
                <div
                  key={day}
                  className={`border-b border-r px-2 py-2 text-center text-xs font-medium ${
                    isToday(day)
                      ? "bg-primary/10 text-primary"
                      : "bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <div>{VI_DAY_NAMES[i]}</div>
                  <div className="font-semibold">{formatDate(day)}</div>
                </div>
              ))}

              {/* Shift rows */}
              {shifts.map((shift) => (
                <>
                  {/* Row label */}
                  <div
                    key={`label-${shift.id}`}
                    className="border-b border-r bg-muted/20 px-3 py-3"
                  >
                    <p className="text-sm font-medium">{shift.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                    </p>
                  </div>

                  {/* Day cells */}
                  {weekDays.map((day) => {
                    const assignees = getAssignees(shift.id, day);
                    return (
                      <div
                        key={`${shift.id}-${day}`}
                        className={`group relative border-b border-r p-1.5 ${
                          isToday(day) ? "bg-primary/5" : "bg-background"
                        }`}
                      >
                        {/* Assigned employee pills */}
                        <div className="flex flex-col gap-1">
                          {assignees.map((s) => (
                            <div
                              key={s.id}
                              className="flex items-center justify-between gap-1 rounded-md border border-border bg-muted px-2 py-0.5"
                            >
                              <span className="truncate text-xs font-medium leading-tight">
                                {s.employee?.full_name ?? "—"}
                              </span>
                              <button
                                type="button"
                                disabled={removingId === s.id}
                                onClick={() => handleRemove(s.id)}
                                className="ml-auto shrink-0 rounded p-0.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
                                aria-label="Xóa lịch"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>

                        {/* Add button */}
                        <button
                          type="button"
                          onClick={() => onOpenAssign(shift.id, shift.name, day)}
                          className="mt-1 flex w-full items-center justify-center rounded-md border border-dashed border-muted-foreground/30 py-0.5 text-muted-foreground opacity-0 transition-opacity hover:border-primary/50 hover:text-primary group-hover:opacity-100"
                          aria-label="Xếp nhân viên"
                        >
                          <Plus className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
