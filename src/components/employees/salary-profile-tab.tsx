"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarIcon, DollarSign } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { saveSalaryProfile, type SalaryProfile } from "@/server/actions/payroll";

interface Props {
  employeeId: string;
  organizationId: string;
  initialProfile: SalaryProfile | null;
}

export function SalaryProfileTab({ employeeId, organizationId, initialProfile }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [salaryType, setSalaryType] = useState<SalaryProfile["salary_type"]>(
    initialProfile?.salary_type || "MONTHLY"
  );
  
  // Format initial amount with commas if exists
  const initialAmount = initialProfile 
    ? new Intl.NumberFormat("vi-VN").format(initialProfile.base_amount) 
    : "";

  const [baseAmount, setBaseAmount] = useState<string>(initialAmount);

  // Default to today in YYYY-MM-DD
  const [effectiveFrom, setEffectiveFrom] = useState<string>(
    initialProfile?.effective_from || new Date().toISOString().slice(0, 10)
  );

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();

    const amount = Number(baseAmount.replace(/[^0-9.-]+/g, ""));
    if (isNaN(amount) || amount < 0) {
      toast.error("Vui lòng nhập mức lương hợp lệ.");
      return;
    }

    if (!effectiveFrom) {
      toast.error("Vui lòng chọn ngày áp dụng.");
      return;
    }

    startTransition(async () => {
      const result = await saveSalaryProfile({
        employee_id: employeeId,
        salary_type: salaryType,
        base_amount: amount,
        effective_from: effectiveFrom,
      });

      if (!result.ok) {
        toast.error(result.error.message);
      } else {
        toast.success("Lưu hồ sơ lương thành công!");
        router.refresh();
      }
    });
  }

  // Helper to format currency gracefully in the input
  function handleAmountChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value.replace(/[^0-9]/g, "");
    if (!val) {
      setBaseAmount("");
      return;
    }
    const formatted = new Intl.NumberFormat("vi-VN").format(Number(val));
    setBaseAmount(formatted);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hồ sơ lương</CardTitle>
        <CardDescription>
          Thiết lập mức lương cho nhân viên. Khi lưu, một bản ghi lịch sử mới sẽ được tạo thay vì sửa đè bản ghi cũ.
        </CardDescription>
      </CardHeader>
      <form onSubmit={onSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Loại lương</Label>
            <Select
              value={salaryType}
              onValueChange={(val: any) => setSalaryType(val)}
              disabled={pending}
            >
              <SelectTrigger>
                <SelectValue placeholder="Chọn loại lương" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="MONTHLY">Cố định tháng</SelectItem>
                <SelectItem value="STANDARD_DAY">Theo ngày công chuẩn</SelectItem>
                <SelectItem value="PER_SHIFT">Theo ca</SelectItem>
                <SelectItem value="HOURLY">Theo giờ</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Mức lương cơ bản (VNĐ)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Ví dụ: 10.000.000"
                className="pl-9"
                value={baseAmount}
                onChange={handleAmountChange}
                disabled={pending}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Ngày áp dụng</Label>
            <Input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              disabled={pending}
              required
            />
          </div>
        </CardContent>
        <CardFooter className="flex justify-end border-t pt-4">
          <Button type="submit" disabled={pending}>
            {pending ? "Đang lưu..." : "Lưu hồ sơ lương"}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}