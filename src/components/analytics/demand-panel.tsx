"use client";

import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import { refreshDemandForecasts } from "@/server/actions/analytics";
import type { DemandForecastView } from "@/types/analytics";

const INSUFFICIENT = "Cần ít nhất 14 ngày đơn đã thanh toán";

function formatQty(value: number) {
  return value.toLocaleString("vi-VN", { maximumFractionDigits: 2 });
}

export function DemandPanel({
  view,
  canRefresh,
}: {
  view: DemandForecastView;
  canRefresh: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  function onRefresh() {
    startTransition(async () => {
      const res = await refreshDemandForecasts();
      if (!res.ok) {
        notifyError("Không dự báo được nhu cầu", res.error.message);
        return;
      }
      notifySuccess(
        "Đã cập nhật dự báo nhu cầu",
        `${res.data.dishes.toLocaleString("vi-VN")} món, ${res.data.ingredients.toLocaleString("vi-VN")} nguyên liệu`,
      );
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          Holt-Winters 14 ngày, nhân định lượng công thức để gợi ý đặt hàng.
        </p>
        {canRefresh ? (
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isPending ? "Đang dự báo..." : "Cập nhật dự báo"}
          </Button>
        ) : null}
      </div>

      {view.insufficientData || view.dishes.length === 0 ? (
        <p className="rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          {INSUFFICIENT}
        </p>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Nhu cầu món</CardTitle>
              <CardDescription>Số lượng dự báo 7 ngày và 14 ngày tới.</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Món</TableHead>
                    <TableHead className="text-right">7 ngày</TableHead>
                    <TableHead className="text-right">14 ngày</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {view.dishes.map((row) => (
                    <TableRow key={row.productId}>
                      <TableCell>{row.productName}</TableCell>
                      <TableCell className="text-right">{formatQty(row.qty7)}</TableCell>
                      <TableCell className="text-right">{formatQty(row.qty14)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Nhu cầu nguyên liệu</CardTitle>
              <CardDescription>Dự báo, tồn kho hiện tại và đề xuất mua.</CardDescription>
            </CardHeader>
            <CardContent>
              {view.ingredients.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có công thức để quy đổi nguyên liệu.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nguyên liệu</TableHead>
                      <TableHead>Đơn vị</TableHead>
                      <TableHead className="text-right">Dự báo</TableHead>
                      <TableHead className="text-right">Tồn</TableHead>
                      <TableHead className="text-right">Đề xuất mua</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {view.ingredients.map((row) => (
                      <TableRow key={row.inventoryItemId}>
                        <TableCell>{row.name}</TableCell>
                        <TableCell>{row.unit || "—"}</TableCell>
                        <TableCell className="text-right">{formatQty(row.forecastQty)}</TableCell>
                        <TableCell className="text-right">{formatQty(row.onHand)}</TableCell>
                        <TableCell className="text-right">{formatQty(row.suggestedPurchase)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
