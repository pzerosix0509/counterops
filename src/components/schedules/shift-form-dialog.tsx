"use client";

import { useState, useEffect, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { upsertShift } from "@/server/actions/schedules";
import type { Shift } from "./schedules-client";

interface Props {
  open: boolean;
  editing: Shift | null;
  organizationId: string;
  branchId: string;
  onClose: () => void;
  onSaved: (shift: Shift) => void;
}

const emptyForm = {
  name: "",
  start_time: "08:00",
  end_time: "16:00",
  is_active: true,
};

export function ShiftFormDialog({
  open,
  editing,
  organizationId,
  branchId,
  onClose,
  onSaved,
}: Props) {
  const [form, setForm] = useState(() =>
    editing
      ? {
          name: editing.name,
          start_time: editing.start_time.slice(0, 5),
          end_time: editing.end_time.slice(0, 5),
          is_active: editing.is_active,
        }
      : { ...emptyForm }
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setForm(
        editing
          ? {
              name: editing.name,
              start_time: editing.start_time.slice(0, 5),
              end_time: editing.end_time.slice(0, 5),
              is_active: editing.is_active,
            }
          : { ...emptyForm }
      );
    }
  }, [open, editing]);

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onClose();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await upsertShift({
        id: editing?.id,
        organization_id: organizationId,
        branch_id: branchId,
        name: form.name,
        start_time: form.start_time,
        end_time: form.end_time,
        is_active: form.is_active,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      toast.success(editing ? "Đã cập nhật ca làm việc." : "Đã tạo ca làm việc mới.");
      onSaved(result.data as Shift);
      onClose();
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{editing ? "Chỉnh sửa ca làm việc" : "Thêm ca làm việc"}</DialogTitle>
          <DialogDescription>
            {editing ? `Đang chỉnh sửa: ${editing.name}` : "Tạo một ca mới cho chi nhánh này."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="shift-name">Tên ca</Label>
            <Input
              id="shift-name"
              placeholder="Ví dụ: Ca Sáng, Ca Chiều..."
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="start-time">Giờ bắt đầu</Label>
              <Input
                id="start-time"
                type="time"
                value={form.start_time}
                onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="end-time">Giờ kết thúc</Label>
              <Input
                id="end-time"
                type="time"
                value={form.end_time}
                onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                required
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="is-active"
              type="checkbox"
              className="h-4 w-4 rounded border-input accent-primary"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            <Label htmlFor="is-active" className="cursor-pointer">
              Ca đang hoạt động
            </Label>
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Hủy
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : editing ? "Lưu thay đổi" : "Tạo ca"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
