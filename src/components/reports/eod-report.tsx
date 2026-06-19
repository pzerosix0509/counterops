"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatVND } from "@/lib/date/ranges";
import { formatDateTime } from "@/lib/utils/format";
import { generateEndOfDayReport } from "@/server/actions/eod";
import type { EndOfDayReport } from "@/types/database";
import type { EodComputation } from "@/server/queries/eod";

const METHOD_LABEL: Record<string, string> = {
  cash: "Tiền mặt",
  bank_transfer: "Chuyển khoản",
  card: "Thẻ",
  ewallet: "Ví điện tử",
  debt: "Ghi nợ",
  other: "Khác",
};

export function EodReport({
  organizationId,
  branchId,
  canGenerate,
  date,
  data,
  savedReport,
}: {
  organizationId: string;
  branchId: string;
  canGenerate: boolean;
  date: string;
  data: EodComputation;
  savedReport: EndOfDayReport | null;
}) {
  const router = useRouter();
  const [picked, setPicked] = useState(date);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onApply() {
    router.push(`/reports/end-of-day?date=${picked}`);
  }

  function onGenerate() {
    setError(null);
    startTransition(async () => {
      const res = await generateEndOfDayReport(organizationId, { branchId, reportDate: picked });
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-sm">Ngày báo cáo</CardTitle>
            <CardDescription>Chọn ngày để xem hoặc tạo báo cáo cuối ngày.</CardDescription>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Input type="date" value={picked} onChange={(e) => setPicked(e.target.value)} className="w-44" />
            <Button variant="outline" onClick={onApply}>Áp dụng</Button>
            {canGenerate ? (
              <Button onClick={onGenerate} disabled={isPending}>
                {isPending ? "Đang tạo..." : "Lưu báo cáo"}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        {error ? <CardContent className="pt-0 text-sm text-destructive">{error}</CardContent> : null}
      </Card>

      {savedReport ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Báo cáo đã lưu</CardTitle>
            <CardDescription>
              Mã chứng từ: <span className="font-mono">{savedReport.document_code}</span> • Lưu lúc {formatDateTime(savedReport.generated_at)}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Tổng đơn đã thanh toán</CardTitle></CardHeader>
          <CardContent><p className="text-lg font-semibold">{data.totalOrders.toLocaleString("vi-VN")}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Doanh thu thuần</CardTitle></CardHeader>
          <CardContent><p className="text-lg font-semibold">{formatVND(data.netRevenue)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Tổng thanh toán</CardTitle></CardHeader>
          <CardContent><p className="text-lg font-semibold">{formatVND(data.totalPaid)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground">Ghi nợ</CardTitle></CardHeader>
          <CardContent><p className="text-lg font-semibold">{formatVND(data.debtAmount)}</p></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="text-sm">Tổng hợp doanh thu</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Tổng tiền hàng</span><span>{formatVND(data.grossSales)}</span></div>
            <div className="flex justify-between"><span>Giảm giá hóa đơn</span><span>-{formatVND(data.discounts)}</span></div>
            <div className="flex justify-between"><span>Thuế</span><span>{formatVND(data.tax)}</span></div>
            <div className="flex justify-between"><span>Phí dịch vụ</span><span>{formatVND(data.serviceFee)}</span></div>
            <div className="flex justify-between border-t pt-1 font-semibold"><span>Doanh thu</span><span>{formatVND(data.netRevenue)}</span></div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm">Thanh toán & hủy</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between"><span>Tiền mặt</span><span>{formatVND(data.cashTotal)}</span></div>
            <div className="flex justify-between"><span>Chuyển khoản</span><span>{formatVND(data.bankTransferTotal)}</span></div>
            <div className="flex justify-between"><span>Thẻ</span><span>{formatVND(data.cardTotal)}</span></div>
            <div className="flex justify-between"><span>Ví điện tử</span><span>{formatVND(data.ewalletTotal)}</span></div>
            <div className="flex justify-between"><span>Ghi nợ (phương thức)</span><span>{formatVND(data.debtPayments)}</span></div>
            <div className="flex justify-between"><span>Khác</span><span>{formatVND(data.otherPayments)}</span></div>
            <div className="mt-2 flex justify-between border-t pt-1"><span>Đơn bị hủy</span><Badge variant="warning">{data.cancelledOrders}</Badge></div>
            <div className="flex justify-between"><span>Giá trị đơn bị hủy</span><span>{formatVND(data.cancelledAmount)}</span></div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Chi tiết đơn đã thanh toán</CardTitle>
          <CardDescription>{data.orders.length} đơn trong ngày.</CardDescription>
        </CardHeader>
        <CardContent>
          {data.orders.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Chưa có đơn đã thanh toán trong ngày này.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mã đơn</TableHead>
                  <TableHead>Bàn</TableHead>
                  <TableHead>Mở</TableHead>
                  <TableHead>Đóng</TableHead>
                  <TableHead>Thanh toán</TableHead>
                  <TableHead className="text-right">Tổng</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.orders.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="font-mono text-xs">{o.orderNumber}</TableCell>
                    <TableCell>{o.tableName ?? "Mang đi"}</TableCell>
                    <TableCell className="text-xs">{formatDateTime(o.openedAt)}</TableCell>
                    <TableCell className="text-xs">{o.closedAt ? formatDateTime(o.closedAt) : "—"}</TableCell>
                    <TableCell className="text-xs">
                      {o.payments.map((p) => `${METHOD_LABEL[p.method] ?? p.method}: ${formatVND(p.amount)}`).join(", ") || "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium">{formatVND(o.total)}</TableCell>
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
