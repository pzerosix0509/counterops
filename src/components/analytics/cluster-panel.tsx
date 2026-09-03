"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatVND } from "@/lib/date/ranges";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import { fitCustomerClusters } from "@/server/actions/analytics";
import { formatAnalyticsCustomerLabel } from "@/lib/customers/phone";
import type { ClusterCustomerRow, ClusterProfileRow, RfmSegment } from "@/types/analytics";

const SEGMENT_LABELS: Record<RfmSegment, string> = {
  Champions: "Champion",
  "Loyal Customers": "Khách thân thiết",
  "Potential Loyalists": "Tiềm năng trung thành",
  "At Risk": "Sắp mất",
  Lost: "Đã mất",
};

function formatRatio(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function ClusterPanel({
  profiles,
  customers,
  reminder,
  canRefresh,
  fittedAt,
}: {
  profiles: ClusterProfileRow[];
  customers: ClusterCustomerRow[];
  reminder: string;
  canRefresh: boolean;
  fittedAt: string | null;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onFit() {
    startTransition(async () => {
      const res = await fitCustomerClusters();
      if (!res.ok) {
        notifyError("Không phân cụm được", res.error.message);
        return;
      }
      notifySuccess("Đã phân cụm khách", `${res.data.k} nhóm, ${res.data.updated.toLocaleString("vi-VN")} khách`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">{reminder}</p>
        {canRefresh ? (
          <Button variant="outline" size="sm" onClick={onFit} disabled={isPending}>
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {isPending ? "Đang phân cụm..." : "Phân cụm hành vi"}
          </Button>
        ) : null}
      </div>

      {profiles.length === 0 ? (
        <p className="rounded-md border border-dashed bg-card p-8 text-center text-sm text-muted-foreground">
          Chưa có nhóm hành vi. Hãy phân cụm sau khi cập nhật đặc trưng khách.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {profiles.map((profile) => (
            <Card key={profile.cluster_id}>
              <CardHeader className="space-y-1 pb-2">
                <CardTitle className="text-sm">{profile.label}</CardTitle>
                <CardDescription>
                  Cụm {profile.cluster_id} · {profile.size.toLocaleString("vi-VN")} khách
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>
                  <p>Recency TB</p>
                  <p className="text-sm font-medium text-foreground">{profile.avg_recency.toFixed(0)} ngày</p>
                </div>
                <div>
                  <p>Tần suất TB</p>
                  <p className="text-sm font-medium text-foreground">{profile.avg_frequency.toFixed(1)}</p>
                </div>
                <div>
                  <p>Chi tiêu TB</p>
                  <p className="text-sm font-medium text-foreground">{formatVND(profile.avg_monetary)}</p>
                </div>
                <div>
                  <p>Ăn tối</p>
                  <p className="text-sm font-medium text-foreground">{formatRatio(profile.dinner_ratio)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Khách theo cụm và RFM</CardTitle>
          <CardDescription>
            Hai cột riêng: cluster là hành vi, RFM là giá trị.
            {fittedAt ? ` Lần fit gần nhất: ${new Date(fittedAt).toLocaleString("vi-VN")}.` : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {customers.length === 0 ? (
            <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
              Chưa gán cluster_id. Hãy chạy phân cụm hành vi.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Khách</TableHead>
                  <TableHead>cluster_id</TableHead>
                  <TableHead>rfm_segment</TableHead>
                  <TableHead className="text-right">Recency</TableHead>
                  <TableHead className="text-right">Tần suất</TableHead>
                  <TableHead className="text-right">Chi tiêu</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((row) => (
                  <TableRow key={row.customerId}>
                    <TableCell className="font-medium">
                      {formatAnalyticsCustomerLabel(row.customerPhone, row.customerName)}
                    </TableCell>
                    <TableCell>
                      {row.clusterId == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge variant="info">{row.clusterId}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {row.rfmSegment ? (
                        <Badge variant="secondary">{SEGMENT_LABELS[row.rfmSegment]}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
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
