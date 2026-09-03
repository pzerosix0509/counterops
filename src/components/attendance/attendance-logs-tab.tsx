"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AttendanceLogWithDetails } from "@/server/actions/attendance";

interface Props {
  logs: AttendanceLogWithDetails[];
  date: string;
  navigating: boolean;
  onNavigate: (direction: -1 | 1) => void;
  onToday: () => void;
}

const VI_WEEKDAYS = [
  "Chủ nhật",
  "Thứ hai",
  "Thứ ba",
  "Thứ tư",
  "Thứ năm",
  "Thứ sáu",
  "Thứ bảy",
];

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const weekday = VI_WEEKDAYS[d.getDay()];
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${weekday}, ${day}/${month}/${year}`;
}

function formatTime(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function isToday(dateStr: string): boolean {
  return new Date().toISOString().slice(0, 10) === dateStr;
}

export function AttendanceLogsTab({ logs, date, navigating, onNavigate, onToday }: Props) {
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Date navigation */}
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" size="sm" onClick={() => onNavigate(-1)} disabled={navigating}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{formatDateLabel(date)}</span>
            {!isToday(date) && (
              <Button variant="ghost" size="sm" onClick={onToday} disabled={navigating}>
                Hôm nay
              </Button>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => onNavigate(1)} disabled={navigating}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Table */}
        {logs.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            Không có dữ liệu chấm công cho ngày này.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã NV</TableHead>
                  <TableHead>Nhân viên</TableHead>
                  <TableHead>Ca</TableHead>
                  <TableHead>Giờ vào</TableHead>
                  <TableHead>Giờ ra</TableHead>
                  <TableHead>Công tính</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => {
                  const shift = log.schedule?.shift ?? null;
                  const isActive = log.check_out_time === null;
                  const workUnit = log.work_unit;

                  return (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {log.employee?.employee_code ?? "—"}
                      </TableCell>
                      <TableCell className="font-medium">
                        {log.employee?.full_name ?? "—"}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {shift
                          ? `${shift.name} (${shift.start_time.slice(0, 5)}–${shift.end_time.slice(0, 5)})`
                          : "—"}
                      </TableCell>
                      <TableCell>{formatTime(log.check_in_time)}</TableCell>
                      <TableCell>{formatTime(log.check_out_time)}</TableCell>
                      <TableCell>
                        {isActive ? (
                          <span className="text-sm text-muted-foreground">—</span>
                        ) : workUnit === 1 ? (
                          <span className="text-sm font-medium">1 công</span>
                        ) : workUnit === 0.5 ? (
                          <span className="text-sm font-medium">0.5 công</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">0</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {isActive && (
                            <Badge className="border-green-600 bg-green-50 text-green-700 dark:bg-green-950">
                              <span className="relative mr-1.5 flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-500 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-600" />
                              </span>
                              Đang làm việc
                            </Badge>
                          )}
                          {log.is_late && (
                            <Badge variant="outline" className="border-amber-500 text-amber-600">
                              Đi trễ
                            </Badge>
                          )}
                          {log.is_early_leave && (
                            <Badge variant="outline" className="border-orange-500 text-orange-600">
                              Về sớm
                            </Badge>
                          )}
                          {(log.overtime_after_minutes ?? 0) > 0 && (
                            <Badge variant="outline" className="border-blue-500 text-blue-600">
                              Tăng ca {log.overtime_after_minutes}ph
                            </Badge>
                          )}
                          {!isActive &&
                            !log.is_late &&
                            !log.is_early_leave &&
                            (log.overtime_after_minutes ?? 0) === 0 && (
                              <Badge
                                variant="outline"
                                className="border-muted-foreground text-muted-foreground"
                              >
                                Đúng giờ
                              </Badge>
                            )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}