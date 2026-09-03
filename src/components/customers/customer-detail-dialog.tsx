"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { clusterLabel, rfmSegmentLabel, SEGMENT_VARIANT } from "@/lib/customers/labels";
import { formatDate, formatDateTime } from "@/lib/utils/format";
import { formatVND } from "@/lib/date/ranges";
import type { CustomerDetail } from "@/types/customers";

function formatRatio(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{value ?? "—"}</p>
    </div>
  );
}

export function CustomerDetailDialog({
  customer,
  canManage,
  onClose,
  onEdit,
}: {
  customer: CustomerDetail | null;
  canManage: boolean;
  onClose: () => void;
  onEdit: () => void;
}) {
  const features = customer?.features;
  const analyticsHref = features?.rfmSegment
    ? `/analytics?tab=rfm&segment=${encodeURIComponent(features.rfmSegment)}`
    : "/analytics?tab=rfm";

  return (
    <Dialog open={!!customer} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer?.displayName ?? "Khách hàng"}</DialogTitle>
          <DialogDescription>Thông tin cơ bản, phân tích chi nhánh và lịch sử gần đây.</DialogDescription>
        </DialogHeader>
        {customer ? (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <Field label="SĐT" value={customer.phone ?? "—"} />
              <Field label="Email" value={customer.email ?? "—"} />
              <Field label="Sinh nhật" value={formatDate(customer.birthday)} />
              <Field label="Ngày tạo" value={formatDateTime(customer.createdAt)} />
              <div className="col-span-2">
                <Field label="Ghi chú" value={customer.notes ?? "—"} />
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Phân tích chi nhánh</p>
              {features ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Segment</p>
                    {features.rfmSegment ? (
                      <Badge variant={SEGMENT_VARIANT[features.rfmSegment]}>{rfmSegmentLabel(features.rfmSegment)}</Badge>
                    ) : (
                      <p className="text-sm">Chưa phân loại</p>
                    )}
                  </div>
                  <Field label="Nhóm" value={clusterLabel(features.clusterId)} />
                  <Field label="Recency" value={features.recencyDays == null ? "—" : `${features.recencyDays} ngày`} />
                  <Field label="Tần suất" value={features.frequency?.toLocaleString("vi-VN") ?? "—"} />
                  <Field label="Chi tiêu" value={features.monetary == null ? "—" : formatVND(features.monetary)} />
                  <Field
                    label="R / F / M"
                    value={`${features.rScore ?? "—"} / ${features.fScore ?? "—"} / ${features.mScore ?? "—"}`}
                  />
                  <Field label="Cuối tuần" value={formatRatio(features.weekendRatio)} />
                  <Field label="Buổi tối" value={formatRatio(features.dinnerRatio)} />
                  <Field label="Đánh giá TB" value={features.avgRating == null ? "—" : features.avgRating.toFixed(1)} />
                  <Field label="Cảm xúc" value={features.sentimentScore == null ? "—" : features.sentimentScore.toFixed(2)} />
                  <Field label="Danh mục yêu thích" value={features.favoriteCategory ?? "—"} />
                  <Field label="Món yêu thích" value={features.favoriteDishName ?? "—"} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Chưa có đặc trưng phân tích tại chi nhánh này.</p>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Đơn thanh toán gần đây</p>
              {customer.recentOrders.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có đơn đã thanh toán.</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {customer.recentOrders.map((order) => (
                    <li key={order.id} className="flex justify-between gap-2">
                      <span>{order.orderNumber}</span>
                      <span className="text-muted-foreground">{formatDateTime(order.openedAt)}</span>
                      <span className="font-medium">{formatVND(order.totalAmount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Phản hồi gần đây</p>
              {customer.recentFeedback.length === 0 ? (
                <p className="text-sm text-muted-foreground">Chưa có phản hồi.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {customer.recentFeedback.map((row) => (
                    <li key={row.id}>
                      <span className="font-medium">{row.rating}/5</span>
                      {row.sentimentLabel ? <span className="text-muted-foreground"> · {row.sentimentLabel}</span> : null}
                      <p className="text-muted-foreground">{row.feedbackText?.trim() || "—"}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" asChild>
            <Link href={analyticsHref}>Xem trên Phân tích</Link>
          </Button>
          {canManage ? <Button onClick={onEdit}>Sửa</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
