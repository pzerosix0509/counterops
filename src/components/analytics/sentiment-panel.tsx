"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import { createCustomerFeedback } from "@/server/actions/feedback";
import type { FeedbackListRow } from "@/types/analytics";

function sentimentDisplay(row: FeedbackListRow) {
  if (!row.feedbackText?.trim()) return "—";
  if (!row.sentimentLabel) return "chưa chấm điểm";
  const labels: Record<string, string> = {
    positive: "Tích cực",
    neutral: "Trung lập",
    negative: "Tiêu cực",
  };
  const label = labels[row.sentimentLabel] ?? row.sentimentLabel;
  return row.sentimentScore == null ? label : `${label} (${row.sentimentScore.toFixed(2)})`;
}

export function SentimentPanel({ rows }: { rows: FeedbackListRow[] }) {
  const [isPending, startTransition] = useTransition();
  const [rating, setRating] = useState(5);
  const [feedbackText, setFeedbackText] = useState("");
  const [orderId, setOrderId] = useState("");

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      const res = await createCustomerFeedback({
        rating,
        feedbackText: feedbackText.trim() || null,
        orderId: orderId.trim() || null,
      });
      if (!res.ok) {
        notifyError("Không lưu được phản hồi", res.error.message);
        return;
      }
      notifySuccess("Đã lưu phản hồi", "Cảm xúc sẽ được chấm khi cập nhật dữ liệu.");
      setFeedbackText("");
      setOrderId("");
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Ghi nhận phản hồi</CardTitle>
          <CardDescription>
            Điểm sao tách khỏi cảm xúc văn bản. Chưa chấm LLM thì hiện "chưa chấm điểm".
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-3 sm:grid-cols-2" onSubmit={onSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="feedback-rating">Điểm (1-5)</Label>
              <Input
                id="feedback-rating"
                type="number"
                min={1}
                max={5}
                value={rating}
                onChange={(event) => setRating(Number(event.target.value))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="feedback-order">Mã đơn (tuỳ chọn)</Label>
              <Input
                id="feedback-order"
                value={orderId}
                onChange={(event) => setOrderId(event.target.value)}
                placeholder="UUID đơn"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="feedback-text">Nội dung</Label>
              <Textarea
                id="feedback-text"
                value={feedbackText}
                onChange={(event) => setFeedbackText(event.target.value)}
                rows={3}
                placeholder="Nhập nhận xét của khách"
              />
            </div>
            <div>
              <Button type="submit" disabled={isPending}>
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {isPending ? "Đang lưu..." : "Lưu phản hồi"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Phản hồi gần đây</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Điểm</TableHead>
                <TableHead>Nội dung</TableHead>
                <TableHead>Cảm xúc</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    Chưa có phản hồi.
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.rating}</TableCell>
                    <TableCell className="max-w-md truncate">{row.feedbackText ?? "—"}</TableCell>
                    <TableCell>{sentimentDisplay(row)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
