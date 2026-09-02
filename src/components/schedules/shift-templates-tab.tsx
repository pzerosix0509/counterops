"use client";

import { useState, useTransition } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { deleteShift } from "@/server/actions/schedules";
import type { Shift } from "./schedules-client";

interface Props {
  organizationId: string;
  shifts: Shift[];
  onEdit: (shift: Shift) => void;
  onAdd: () => void;
  onDelete: (shiftId: string) => void;
}

function formatTime(t: string) {
  return t?.slice(0, 5) ?? t;
}

export function ShiftTemplatesTab({ organizationId, shifts, onEdit, onAdd, onDelete }: Props) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function handleDelete(shiftId: string) {
    if (!confirm("Bạn có chắc chắn muốn xóa ca làm việc này?")) return;
    
    setPendingId(shiftId);
    try {
      const result = await deleteShift(organizationId, shiftId);
      if (!result.ok) {
        toast.error(result.error.message);
      } else {
        toast.success("Đã xóa ca làm việc thành công.");
        onDelete(shiftId);
      }
    } catch (err) {
      toast.error("Đã xảy ra lỗi khi xóa ca làm việc.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Danh sách ca làm việc</CardTitle>
          <CardDescription>
            Các ca mặc định được áp dụng cho chi nhánh này.
          </CardDescription>
        </div>
        <Button size="sm" onClick={onAdd}>
          <Plus className="mr-1.5 h-4 w-4" />
          Thêm ca làm việc
        </Button>
      </CardHeader>
      <CardContent>
        {shifts.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Chưa có ca nào được tạo. Nhấn "Thêm ca làm việc" để bắt đầu.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên ca</TableHead>
                <TableHead>Giờ bắt đầu</TableHead>
                <TableHead>Giờ kết thúc</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="text-right">Thao tác</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shifts.map((shift) => (
                <TableRow key={shift.id}>
                  <TableCell className="font-medium">{shift.name}</TableCell>
                  <TableCell>{formatTime(shift.start_time)}</TableCell>
                  <TableCell>{formatTime(shift.end_time)}</TableCell>
                  <TableCell>
                    {shift.is_active ? (
                      <Badge variant="outline" className="border-green-600 text-green-700">
                        Hoạt động
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-muted-foreground text-muted-foreground">
                        Tạm tắt
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onEdit(shift)}
                        disabled={pendingId === shift.id}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => handleDelete(shift.id)}
                        disabled={pendingId === shift.id}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
