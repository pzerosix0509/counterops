"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatVND } from "@/lib/date/ranges";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import { refreshCustomerAnalytics } from "@/server/actions/analytics";
import type { RfmCustomerRow, RfmSegment, RfmSummaryRow } from "@/types/analytics";

const RFM_SEGMENTS: RfmSegment[] = [
  "Champions",
  "Loyal Customers",
  "Potential Loyalists",
  "At Risk",
  "Lost",
];

const SEGMENT_LABELS: Record<RfmSegment, string> = {
  Champions: "Champion",
  "Loyal Customers": "Khách thân thiết",
  "Potential Loyalists": "Tiềm năng trung thành",
  "At Risk": "Sắp mất",
  Lost: "Đã mất",
};

const SEGMENT_VARIANT: Record<RfmSegment, "success" | "info" | "secondary" | "warning" | "danger"> = {
  Champions: "success",
  "Loyal Customers": "info",
  "Potential Loyalists": "secondary",
  "At Risk": "warning",
  Lost: "danger",
};

function shortCustomerId(customerId: string) {
  return customerId.replace(/-/g, "").slice(0, 8);
}

function formatScore(value: number | null) {
  return value == null ? "—" : String(value);
}

export function RefreshAnalyticsButton({ canRefresh }: { canRefresh: boolean }) {
  const [isPending, startTransition] = useTransition();

  if (!canRefresh) return null;

  function onRefresh() {
    startTransition(async () => {
      const res = await refreshCustomerAnalytics();
      if (!res.ok) {
        notifyError("Không cập nhật được dữ liệu", res.error.message);
        return;
      }
      notifySuccess("Đã cập nhật dữ liệu phân tích", `${res.data.updated.toLocaleString("vi-VN")} khách`);
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={onRefresh} disabled={isPending}>
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {isPending ? "Đang cập nhật..." : "Cập nhật dữ liệu"}
    </Button>
  );
}

export function RfmPanel({
  summary,
  customers,
  segment,
}: {
  summary: RfmSummaryRow[];
  customers: RfmCustomerRow[];
  segment?: RfmSegment;
}) {
  const router = useRouter();

  const counts = new Map<RfmSegment, number>();
  for (const row of summary) {
    if (row.segment) counts.set(row.segment, row.customerCount);
  }

  function onSegmentChange(value: string) {
    const params = new URLSearchParams();
    params.set("tab", "rfm");
    if (value !== "all") params.set("segment", value);
    router.push(`/analytics?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {RFM_SEGMENTS.map((seg) => {
          const count = counts.get(seg) ?? 0;
          return (
            <Card key={seg}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground">{SEGMENT_LABELS[seg]}</CardTitle>
                <Badge variant={SEGMENT_VARIANT[seg]}>{seg}</Badge>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-semibold">{count.toLocaleString("vi-VN")}</p>
                <p className="text-xs text-muted-foreground">khách</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle>Danh sách khách theo RFM</CardTitle>
            <CardDescription>Hiển thị tối đa 100 khách, sắp xếp theo giá trị chi tiêu.</CardDescription>
          </div>
          <Select value={segment ?? "all"} onValueChange={onSegmentChange}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Lọc theo nhóm" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tất cả nhóm</SelectItem>
              {RFM_SEGMENTS.map((seg) => (
                <SelectItem key={seg} value={seg}>{SEGMENT_LABELS[seg]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Chưa có dữ liệu RFM. Hãy cập nhật dữ liệu phân tích.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Khách</TableHead>
                  <TableHead>Nhóm</TableHead>
                  <TableHead className="text-right">R</TableHead>
                  <TableHead className="text-right">F</TableHead>
                  <TableHead className="text-right">M</TableHead>
                  <TableHead className="text-right">Recency (ngày)</TableHead>
                  <TableHead className="text-right">Tần suất</TableHead>
                  <TableHead className="text-right">Chi tiêu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((row) => (
                  <TableRow key={row.customerId}>
                    <TableCell className="font-medium">Khách {shortCustomerId(row.customerId)}</TableCell>
                    <TableCell>
                      {row.segment ? (
                        <Badge variant={SEGMENT_VARIANT[row.segment]}>{SEGMENT_LABELS[row.segment]}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{formatScore(row.rScore)}</TableCell>
                    <TableCell className="text-right">{formatScore(row.fScore)}</TableCell>
                    <TableCell className="text-right">{formatScore(row.mScore)}</TableCell>
                    <TableCell className="text-right">{row.recencyDays.toLocaleString("vi-VN")}</TableCell>
                    <TableCell className="text-right">{row.frequency.toLocaleString("vi-VN")}</TableCell>
                    <TableCell className="text-right font-medium">{formatVND(row.monetary)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
