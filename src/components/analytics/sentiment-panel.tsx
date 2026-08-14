"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import { ratingIsNotSentiment } from "@/lib/analytics/sentiment";
import { createCustomerFeedback } from "@/server/actions/feedback";
import type { FeedbackListRow, SentimentSummary } from "@/types/analytics";

const SENTIMENT_LABELS = {
  positive: "Tích cực",
  neutral: "Trung lập",
  negative: "Tiêu cực",
} as const;

type SentimentLabel = keyof typeof SENTIMENT_LABELS;

function isSentimentLabel(value: string | null): value is SentimentLabel {
  return value === "positive" || value === "neutral" || value === "negative";
}

function excerpt(text: string | null, max = 80) {
  if (!text?.trim()) return "—";
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

function sentimentDisplay(row: FeedbackListRow) {
  if (!row.feedbackText?.trim()) return "—";
  if (!row.sentimentLabel) return "chưa chấm điểm";
  const label = isSentimentLabel(row.sentimentLabel)
    ? SENTIMENT_LABELS[row.sentimentLabel]
    : row.sentimentLabel;
  return row.sentimentScore == null ? label : `${label} (${row.sentimentScore.toFixed(2)})`;
}

function mismatchWarning(row: FeedbackListRow) {
  if (!isSentimentLabel(row.sentimentLabel)) return null;
  if (!ratingIsNotSentiment(row.rating, row.sentimentLabel)) return null;
  if (row.rating >= 4 && row.sentimentLabel === "negative") {
    return "Điểm cao nhưng cảm xúc tiêu cực";
  }
  if (row.rating <= 2 && row.sentimentLabel === "positive") {
    return "Điểm thấp nhưng cảm xúc tích cực";
  }
  return "Điểm và cảm xúc không khớp";
}

export function SentimentPanel({
  rows,
  summary,
}: {
  rows: FeedbackListRow[];
  summary: SentimentSummary;
}) {
  const router = useRouter();
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
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {(
          [
            ["positive", "success", "Tích cực"],
            ["neutral", "secondary", "Trung lập"],
            ["negative", "danger", "Tiêu cực"],
          ] as const
        ).map(([key, variant, label]) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              <Badge variant={variant}>{key}</Badge>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-semibold">{summary[key].toLocaleString("vi-VN")}</p>
              <p className="text-xs text-muted-foreground">phản hồi đã chấm (90 ngày)</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ghi nhận phản hồi</CardTitle>
          <CardDescription>
            Điểm sao tách khỏi cảm xúc văn bản. Chưa chấm LLM thì hiện “chưa chấm điểm”.
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
                rows.map((row) => {
                  const warning = mismatchWarning(row);
                  return (
                    <TableRow key={row.id}>
                      <TableCell>{row.rating}</TableCell>
                      <TableCell className="max-w-md truncate">{excerpt(row.feedbackText)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span>{sentimentDisplay(row)}</span>
                          {warning ? <Badge variant="warning">{warning}</Badge> : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
