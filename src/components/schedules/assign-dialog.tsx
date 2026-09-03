"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { assignSchedule } from "@/server/actions/schedules";
import type { Employee, Schedule } from "./schedules-client";

interface Props {
  open: boolean;
  shiftId: string;
  shiftName: string;
  workDate: string;
  employees: Employee[];
  scheduledEmployeeIds: string[];
  organizationId: string;
  branchId: string;
  onClose: () => void;
  onAssigned: (schedule: Schedule) => void;
}

function formatDateVi(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("vi-VN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function AssignDialog({
  open,
  shiftId,
  shiftName,
  workDate,
  employees,
  scheduledEmployeeIds,
  organizationId,
  branchId,
  onClose,
  onAssigned,
}: Props) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string>("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const available = employees.filter(
    (e) => !scheduledEmployeeIds.includes(e.id)
  );

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onClose();
      setSelectedEmployeeId("");
      setError(null);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmployeeId) {
      setError("Vui lòng chọn nhân viên.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await assignSchedule(
        organizationId,
        branchId,
        selectedEmployeeId,
        shiftId,
        workDate
      );
      if (!result.ok) {
        if (result.error.code === "CONFLICT") {
          setError("Nhân viên này đã được xếp vào ca này trong ngày.");
        } else {
          setError(result.error.message);
        }
        return;
      }
      toast.success("Đã xếp lịch làm việc thành công.");
      const emp = employees.find((e) => e.id === selectedEmployeeId);
      onAssigned({
        ...result.data,
        employee: emp ? { id: emp.id, full_name: emp.full_name } : null,
      } as Schedule);
      onClose();
      setSelectedEmployeeId("");
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Xếp lịch nhân viên</DialogTitle>
          <DialogDescription>
            {shiftName} &mdash; {formatDateVi(workDate)}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="employee-select">Chọn nhân viên</Label>
            {available.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tất cả nhân viên đang hoạt động đã được xếp vào ca này.
              </p>
            ) : (
              <Select
                value={selectedEmployeeId}
                onValueChange={setSelectedEmployeeId}
              >
                <SelectTrigger id="employee-select">
                  <SelectValue placeholder="-- Chọn nhân viên --" />
                </SelectTrigger>
                <SelectContent>
                  {available.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={pending || available.length === 0 || !selectedEmployeeId}
            >
              {pending ? "Đang lưu..." : "Xếp lịch"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
