"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { updateAttendanceSettings } from "@/server/actions/attendance";
import type { AttendanceSettings } from "@/server/actions/attendance";

interface Props {
  settings: AttendanceSettings;
  organizationId: string;
  branchId: string;
  onSaved: (updated: AttendanceSettings) => void;
}

export function AttendanceSettingsTab({ settings, organizationId, branchId, onSaved }: Props) {
  const [form, setForm] = useState({ ...settings });
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function setNum(key: keyof AttendanceSettings, val: string) {
    const n = parseFloat(val);
    setForm((f) => ({ ...f, [key]: isNaN(n) ? 0 : n }));
  }

  function setInt(key: keyof AttendanceSettings, val: string) {
    const n = parseInt(val, 10);
    setForm((f) => ({ ...f, [key]: isNaN(n) ? 0 : n }));
  }

  function setBool(key: keyof AttendanceSettings, checked: boolean) {
    setForm((f) => ({ ...f, [key]: checked }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateAttendanceSettings({
        ...form,
        branch_id: branchId,
        organization_id: organizationId,
      });
      if (!result.ok) {
        setError(result.error.message);
        toast.error(result.error.message);
      } else {
        toast.success("Đã lưu cài đặt chấm công.");
        onSaved(result.data);
      }
    });
  }

  const toggleRules = [
    {
      key: "record_late_early_on_half_day" as const,
      label: "Tính trễ/sớm cho ca nửa ngày",
      desc: "Vẫn ghi nhận thời gian đi trễ, về sớm ngay cả khi nhân viên chỉ làm nửa công.",
    },
    {
      key: "overtime_before_shift_enabled" as const,
      label: "Tính tăng ca trước ca",
      desc: "Tính thêm giờ làm nếu nhân viên check-in sớm hơn giờ bắt đầu ca.",
    },
    {
      key: "overtime_after_shift_enabled" as const,
      label: "Tính tăng ca sau ca",
      desc: "Tính thêm giờ làm nếu nhân viên check-out muộn hơn giờ kết thúc ca.",
    },
    {
      key: "allow_checkin_without_schedule" as const,
      label: "Chấm công tự do (Không cần xếp lịch)",
      desc: "Cho phép nhân viên check-in kể cả khi chưa được xếp ca trong ngày.",
    },
    {
      key: "allow_continuous_shift_checkin" as const,
      label: "Chấm công gộp 2 ca liên tiếp",
      desc: "Nếu làm 2 ca liền nhau, nhân viên chỉ cần check-in ở ca đầu và check-out ở ca cuối.",
    }
  ] as const;

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle>Cài đặt quy tắc chấm công</CardTitle>
          <CardDescription>
            Các ngưỡng thời gian và quy tắc tính công áp dụng cho chi nhánh này.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* --- Standard hours --- */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Tiêu chuẩn công</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="std-hours">Số giờ một ngày công đầy đủ</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="std-hours"
                    type="number"
                    min={1}
                    max={24}
                    step={0.5}
                    value={form.standard_hours_per_day}
                    onChange={(e) => setNum("standard_hours_per_day", e.target.value)}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">giờ</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="half-hours">Ngưỡng tính nửa công</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="half-hours"
                    type="number"
                    min={0.5}
                    max={12}
                    step={0.5}
                    value={form.half_day_hours_threshold}
                    onChange={(e) => setNum("half_day_hours_threshold", e.target.value)}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">giờ</span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* --- Late / early leave thresholds --- */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Biên độ đi trễ / về sớm</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="late-min">Biên độ đi trễ cho phép</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="late-min"
                    type="number"
                    min={0}
                    max={120}
                    value={form.late_threshold_minutes}
                    onChange={(e) => setInt("late_threshold_minutes", e.target.value)}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">phút</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="early-min">Biên độ về sớm cho phép</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="early-min"
                    type="number"
                    min={0}
                    max={120}
                    value={form.early_leave_threshold_minutes}
                    onChange={(e) => setInt("early_leave_threshold_minutes", e.target.value)}
                    className="w-28"
                  />
                  <span className="text-sm text-muted-foreground">phút</span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* --- Toggle rules --- */}
          <div>
            <h3 className="mb-3 text-sm font-semibold">Quy tắc áp dụng</h3>
            <div className="space-y-4">
              {toggleRules.map(({ key, label, desc }) => (
                <label key={key} className="flex cursor-pointer items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                    checked={!!form[key]}
                    onChange={(e) => setBool(key, e.target.checked)}
                  />
                  <div>
                    <p className="text-sm font-medium leading-none">{label}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex justify-end pt-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Đang lưu..." : "Lưu cài đặt"}
            </Button>
          </div>

        </CardContent>
      </Card>
    </form>
  );
}