"use client";

import { useState, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LogIn, LogOut, Clock, CalendarDays, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { checkIn, checkOut } from "@/server/actions/attendance";
import type { PersonalAttendanceData } from "@/app/(app)/my-attendance/page";

interface Props {
  data: PersonalAttendanceData;
}

function formatTimeStr(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function PersonalAttendanceClient({ data }: Props) {
  const { employee, schedule, activeLog, organizationId, branchId } = data;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [clock, setClock] = useState("");

  // Live digital clock
  useEffect(() => {
    function tick() {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, "0");
      const m = String(now.getMinutes()).padStart(2, "0");
      const s = String(now.getSeconds()).padStart(2, "0");
      setClock(`${h}:${m}:${s}`);
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  function handleCheckIn() {
    startTransition(async () => {
      const result = await checkIn(
        organizationId,
        branchId,
        employee.id,
        schedule?.id,
        "MANUAL"
      );
      if (!result.ok) {
        toast.error(result.error.message);
      } else {
        toast.success("Chấm vào ca thành công!");
        router.refresh();
      }
    });
  }

  function handleCheckOut() {
    if (!activeLog) return;
    startTransition(async () => {
      const result = await checkOut(organizationId, branchId, activeLog.id);
      if (!result.ok) {
        toast.error(result.error.message);
      } else {
        toast.success("Chấm ra thành công!");
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-6 px-4 py-8">

      {/* Digital Clock */}
      <div className="flex flex-col items-center gap-1">
        <div className="flex items-center gap-2 text-muted-foreground text-sm">
          <Clock className="h-4 w-4" />
          <span>Giờ hiện tại</span>
        </div>
        <span className="font-mono text-5xl font-bold tracking-tight tabular-nums">
          {clock || "--:--:--"}
        </span>
      </div>

      <Separator />

      {/* Employee Info */}
      <Card>
        <CardContent className="flex items-center gap-4 pt-5">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <User className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">{employee.full_name}</p>
            {employee.employee_code && (
              <p className="text-xs text-muted-foreground font-mono">{employee.employee_code}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Shift Info */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex items-center gap-2 text-sm font-medium mb-3">
            <CalendarDays className="h-4 w-4 text-primary" />
            <span>Ca làm việc hôm nay</span>
          </div>
          {schedule ? (
            <div className="rounded-lg border bg-blue-50 p-4 text-center">
              <p className="text-base font-semibold text-blue-800">{schedule.shift_name}</p>
              <p className="mt-1 text-sm text-blue-600">
                {schedule.start_time.slice(0, 5)} &ndash; {schedule.end_time.slice(0, 5)}
              </p>
            </div>
          ) : (
            <div className="rounded-lg border bg-muted/40 p-4 text-center">
              <p className="text-sm text-muted-foreground">Bạn không có ca nào được xếp hôm nay</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Check-in status */}
      {activeLog && (
        <div className="flex items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-600" />
          </span>
          <p className="text-sm font-medium text-green-800">
            Đang làm việc &mdash; vào lúc {formatTimeStr(activeLog.check_in_time)}
          </p>
        </div>
      )}

      {/* Action Button */}
      {activeLog ? (
        <Button
          size="lg"
          variant="destructive"
          className="h-20 w-full text-lg gap-3"
          onClick={handleCheckOut}
          disabled={pending}
        >
          <LogOut className="h-6 w-6" />
          {pending ? "Đang xử lý..." : "Chấm ra (Check-out)"}
        </Button>
      ) : (
        <Button
          size="lg"
          className="h-20 w-full text-lg gap-3 bg-green-600 hover:bg-green-700 text-white"
          onClick={handleCheckIn}
          disabled={pending}
        >
          <LogIn className="h-6 w-6" />
          {pending ? "Đang xử lý..." : "Chấm vào ca (Check-in)"}
        </Button>
      )}

      {!activeLog && !schedule && (
        <p className="text-center text-xs text-muted-foreground">
          Ghi chú: Quán đang cho phép chấm công tự do không cần lịch.
        </p>
      )}
    </div>
  );
}