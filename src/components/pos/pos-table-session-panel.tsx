"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, Star, UtensilsCrossed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createCustomerFeedback } from "@/server/actions/feedback";
import { updateTableStatus } from "@/server/actions/tables";
import { formatVND } from "@/lib/date/ranges";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import type { PosTableOrderSummary } from "@/server/queries/orders";
import type { DiningTable } from "@/types/database";
import { cn } from "@/lib/utils/format";

export function PosTableSessionPanel({
  organizationId,
  table,
  order,
  onBack,
  onContinueOrder,
  onComplete,
}: {
  organizationId: string;
  table: DiningTable;
  order: PosTableOrderSummary;
  onBack: () => void;
  onContinueOrder: () => void;
  onComplete: () => void;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"choose" | "feedback">("choose");
  const [isPending, startTransition] = useTransition();
  const [rating, setRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState("");

  function submitFeedback(markEmpty: boolean) {
    startTransition(async () => {
      if (feedbackText.trim() || rating !== 5) {
        const feedbackRes = await createCustomerFeedback({
          orderId: order.orderId,
          rating,
          feedbackText: feedbackText.trim() || null,
          customerPhone: order.customerPhone,
          customerName: order.customerName,
        });
        if (!feedbackRes.ok) {
          notifyError("Không lưu được phản hồi", feedbackRes.error.message);
          return;
        }
        notifySuccess("Đã lưu đánh giá");
      }
      if (markEmpty) {
        const statusRes = await updateTableStatus(organizationId, { tableId: table.id, status: "available" });
        if (!statusRes.ok) {
          notifyError("Không đánh dấu được bàn trống", statusRes.error.message);
          return;
        }
        notifySuccess("Đã đánh dấu bàn trống");
        router.refresh();
        onComplete();
        return;
      }
      router.refresh();
      onBack();
    });
  }

  if (mode === "choose") {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Bàn {table.name}</CardTitle>
              <p className="mt-1 text-sm text-muted-foreground">{order.orderNumber}</p>
            </div>
            <Badge variant="success">Đã thanh toán</Badge>
          </div>
          <p className="text-sm font-semibold">{formatVND(order.totalAmount)} · {order.itemCount} món</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Chọn thao tác cho bàn này:</p>
          <Button className="w-full justify-start gap-2" onClick={onContinueOrder}>
            <UtensilsCrossed className="h-4 w-4" />
            Tiếp tục order
          </Button>
          <p className="pl-1 text-xs text-muted-foreground">Thêm món mới và thanh toán tiếp trên cùng bàn.</p>
          <Button variant="outline" className="w-full justify-start gap-2" onClick={() => setMode("feedback")}>
            <Star className="h-4 w-4" />
            Đánh giá khách hàng
          </Button>
          <p className="pl-1 text-xs text-muted-foreground">Nhập phản hồi và đánh dấu bàn trống khi khách rời đi.</p>
          <Button variant="ghost" onClick={onBack}>
            Quay lại sơ đồ bàn
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle className="text-base">
          Đánh giá · Bàn {table.name}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {order.orderNumber} · {formatVND(order.totalAmount)}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Đánh giá</Label>
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setRating(value)}
                className="rounded p-1 hover:bg-muted"
              >
                <Star className={cn("h-6 w-6", value <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="feedback">Ghi chú (tuỳ chọn)</Label>
          <Textarea
            id="feedback"
            rows={3}
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Món ngon, phục vụ nhanh..."
          />
        </div>
        <div className="flex flex-col gap-2">
          <Button onClick={() => submitFeedback(true)} disabled={isPending}>
            <CreditCard className="h-4 w-4" />
            {isPending ? "Đang lưu..." : "Lưu đánh giá & đánh dấu bàn trống"}
          </Button>
          <Button variant="outline" onClick={() => submitFeedback(false)} disabled={isPending}>
            Chỉ lưu đánh giá
          </Button>
          <Button variant="ghost" onClick={() => setMode("choose")} disabled={isPending}>
            Quay lại
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
