"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatVND } from "@/lib/date/ranges";
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
