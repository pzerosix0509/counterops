"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { User, LogIn, LogOut, Clock, CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { checkIn, checkOut } from "@/server/actions/attendance";
import type { KioskEmployeeData } from "@/app/(app)/attendance/kiosk/page";

interface Props {
  employees: KioskEmployeeData[];
  organizationId: string;
  branchId: string;
}

type DialogState =
  | { phase: "idle" }
  | { phase: "checkin"; employee: KioskEmployeeData }
  | { phase: "checkout"; employee: KioskEmployeeData };

function formatTime(ts: string): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function KioskClient({ employees, organizationId, branchId }: Props) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>({ phase: "idle" });
  const [pending, startTransition] = useTransition();

  const isOpen = dialog.phase !== "idle";

  function handleSelectEmployee(employee: KioskEmployeeData) {
    if (employee.activeLog) {
      setDialog({ phase: "checkout", employee });
    } else {
      setDialog({ phase: "checkin", employee });
    }
  }

  function closeDialog() {
    if (!pending) setDialog({ phase: "idle" });
  }

  function handleCheckIn() {
    if (dialog.phase !== "checkin") return;
    const { employee } = dialog;
    startTransition(async () => {
      // Pass the schedule ID if the employee has a schedule today
      const result = await checkIn(organizationId, branchId, employee.id, employee.schedule?.id);
      if (!result.ok) {
        toast.error(result.error.message);
      } else {
        toast.success(`${employee.full_name} — Chấm vào thành công!`);
        setDialog({ phase: "idle" });
        router.refresh();
      }
    });
  }

  function handleCheckOut() {
    if (dialog.phase !== "checkout") return;
    const { employee } = dialog;
    startTransition(async () => {
      if (!employee.activeLog) return;
      const result = await checkOut(organizationId, branchId, employee.activeLog.id);
      if (!result.ok) {
        toast.error(result.error.message);
      } else {
        toast.success(`${employee.full_name} — Chấm ra thành công!`);
        setDialog({ phase: "idle" });
        router.refresh();
      }
    });
  }

  return (
    <>
      {employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center text-muted-foreground gap-3">
          <User className="h-10 w-10 opacity-30" />
          <p className="text-base">Chưa có nhân viên nào trong chi nhánh này.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {employees.map((emp) => (
            <button
              key={emp.id}
              onClick={() => handleSelectEmployee(emp)}
              className="group flex flex-col items-center gap-3 rounded-xl border bg-card p-5 text-center shadow-sm transition-all hover:border-primary hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <div className={`flex h-16 w-16 items-center justify-center rounded-full transition-colors ${emp.activeLog ? 'bg-green-100 text-green-600' : 'bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary'}`}>
                {emp.activeLog ? <Clock className="h-8 w-8" /> : <User className="h-8 w-8" />}
              </div>
              
              <div className="w-full">
                <p className="text-sm font-semibold leading-tight line-clamp-2">{emp.full_name}</p>
                {emp.employee_code && (
                  <p className="mt-0.5 text-xs text-muted-foreground font-mono">{emp.employee_code}</p>
                )}
                
                <div className="mt-2 flex flex-col gap-1 items-center">
                  {emp.schedule ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10">
                      <CalendarDays className="h-3 w-3" />
                      {emp.schedule.shift_name} ({emp.schedule.start_time.slice(0, 5)}-{emp.schedule.end_time.slice(0, 5)})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-0.5 text-[10px] font-medium text-gray-600 ring-1 ring-inset ring-gray-500/10">
                      Không có ca
                    </span>
                  )}

                  {emp.activeLog && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-green-50 px-2 py-0.5 text-[10px] font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-green-600 animate-pulse" />
                      Đã vào: {formatTime(emp.activeLog.check_in_time)}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Check-in / Check-out Dialog */}
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-sm">
          {dialog.phase === "checkin" && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.employee.full_name}</DialogTitle>
                <DialogDescription className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground inline-block" />
                  Chưa chấm vào ca
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-4">
                <Button
                  size="lg"
                  className="w-full h-16 text-base gap-2 bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleCheckIn}
                  disabled={pending}
                >
                  <LogIn className="h-5 w-5" />
                  {pending ? "Đang xử lý..." : "Chấm vào ca (Check-in)"}
                </Button>
                <Button variant="ghost" size="sm" onClick={closeDialog} disabled={pending}>
                  Đóng
                </Button>
              </div>
            </>
          )}

          {dialog.phase === "checkout" && dialog.employee.activeLog && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.employee.full_name}</DialogTitle>
                <DialogDescription className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
                  </span>
                  Đang làm việc — vào lúc {formatTime(dialog.employee.activeLog.check_in_time)}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-4">
                <Button
                  size="lg"
                  className="w-full h-16 text-base gap-2"
                  variant="destructive"
                  onClick={handleCheckOut}
                  disabled={pending}
                >
                  <LogOut className="h-5 w-5" />
                  {pending ? "Đang xử lý..." : "Chấm ra (Check-out)"}
                </Button>
                <Button variant="ghost" size="sm" onClick={closeDialog} disabled={pending}>
                  Đóng
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
