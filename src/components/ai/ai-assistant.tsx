"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, FileText, Loader2, Send, Upload } from "lucide-react";
import { uploadAiDocument } from "@/server/actions/ai-documents";
import { ChartSpecRenderer } from "@/components/ai/chart-spec-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/input";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import { formatVND } from "@/lib/date/ranges";
import { formatDateTime } from "@/lib/utils/format";
import type { AiChatResponse, AiSource } from "@/types/ai";
import type { AiDocument } from "@/types/database";

const SUGGESTED_PROMPTS = [
  "Doanh thu 7 ngày qua thế nào?",
  "Top món có lãi tốt nhất tháng này?",
  "Kênh bán nào hiệu quả nhất hôm nay?",
  "Tóm tắt tài liệu đã upload liên quan đến kho.",
];

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  response?: AiChatResponse;
}

function parseSourceExcerpt(source: AiSource): unknown {
  if (!source.excerpt) return null;
  try {
    return JSON.parse(source.excerpt);
  } catch {
    return source.excerpt;
  }
}

function metricLabel(key: string): string {
  const labels: Record<string, string> = {
    total_orders: "Số đơn",
    net_revenue: "Doanh thu",
    cost_of_goods: "Giá vốn",
    gross_profit: "Lãi gộp",
    channel_fees: "Phí kênh",
    net_profit: "Lãi sau phí",
    quantity: "Số lượng",
    revenue: "Doanh thu",
    orders: "Số đơn",
    channel_fees_short: "Phí",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

function formatSourceValue(key: string, value: unknown): string {
  if (typeof value !== "number") return String(value ?? "-");
  if (key.includes("revenue") || key.includes("cost") || key.includes("profit") || key.includes("fee")) {
    return formatVND(value);
  }
  return value.toLocaleString("vi-VN");
}

function SourcePreview({ source }: { source: AiSource }) {
  const parsed = parseSourceExcerpt(source);

  if (source.type === "document") {
    return (
      <p className="mt-3 rounded-md bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
        {typeof parsed === "string" ? parsed : source.excerpt}
      </p>
    );
  }

  if (source.label.includes("Tổng hợp") && parsed && !Array.isArray(parsed) && typeof parsed === "object") {
    const entries = Object.entries(parsed as Record<string, unknown>);
    return (
      <div className="mt-3 grid grid-cols-2 gap-2">
        {entries.map(([key, value]) => (
          <div key={key} className="rounded-md bg-muted/40 p-2">
            <p className="text-[11px] text-muted-foreground">{metricLabel(key)}</p>
            <p className="mt-1 text-sm font-semibold">{formatSourceValue(key, value)}</p>
          </div>
        ))}
      </div>
    );
  }

  if (Array.isArray(parsed)) {
    const rows = parsed.slice(0, 4) as Array<Record<string, unknown>>;
    const isChannel = rows.some((row) => "channel_name" in row);
    return (
      <div className="mt-3 overflow-hidden rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              <th className="px-2 py-1.5 text-left">{isChannel ? "Kênh" : "Món"}</th>
              <th className="px-2 py-1.5 text-right">{isChannel ? "Đơn" : "SL"}</th>
              <th className="px-2 py-1.5 text-right">Doanh thu</th>
              <th className="px-2 py-1.5 text-right">{isChannel ? "Phí" : "Lãi"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t">
                <td className="max-w-[180px] truncate px-2 py-1.5 font-medium">
                  {String(row.channel_name ?? row.product_name ?? "-")}
                </td>
                <td className="px-2 py-1.5 text-right">
                  {formatSourceValue(isChannel ? "orders" : "quantity", row.orders ?? row.quantity)}
                </td>
                <td className="px-2 py-1.5 text-right">{formatSourceValue("revenue", row.revenue)}</td>
                <td className="px-2 py-1.5 text-right">
                  {formatSourceValue(isChannel ? "channel_fees_short" : "gross_profit", row.channel_fees ?? row.gross_profit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return source.excerpt ? (
    <p className="mt-3 rounded-md bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">{source.excerpt}</p>
  ) : null;
}

export function AiAssistant({
  organizationId,
  branchId,
  documents,
}: {
  organizationId: string;
  branchId: string;
  documents: AiDocument[];
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isAsking, setIsAsking] = useState(false);
  const [isUploading, startUpload] = useTransition();

  function submit(nextQuestion = question) {
    const text = nextQuestion.trim();
    if (!text || isAsking) return;
    setQuestion("");
    setIsAsking(true);
    setMessages((current) => [...current, { role: "user", content: text }]);

    fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question: text }),
    })
      .then(async (res) => {
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error ?? "Không thể hỏi AI.");
        return payload as AiChatResponse;
      })
      .then((payload) => {
        setMessages((current) => [...current, { role: "assistant", content: payload.answer, response: payload }]);
      })
      .catch((error) => {
        notifyError("AI trả lời thất bại", error instanceof Error ? error.message : "Có lỗi xảy ra.");
      })
      .finally(() => setIsAsking(false));
  }

  function onUpload(file: File | undefined) {
    if (!file) return;
    startUpload(async () => {
      try {
        const content = await file.text();
        const result = await uploadAiDocument(organizationId, {
          branchId,
          title: file.name.replace(/\.[^.]+$/, ""),
          fileName: file.name,
          mimeType: file.type || null,
          content,
        });
        if (!result.ok) {
          notifyError("Upload tài liệu thất bại", result.error.message);
          return;
        }
        notifySuccess("Đã upload tài liệu", `${result.data.chunks} đoạn dữ liệu đã sẵn sàng cho AI.`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      } catch (error) {
        notifyError("Không đọc được tệp", error instanceof Error ? error.message : "Vui lòng thử lại.");
      }
    });
  }

  const latestResponse = [...messages].reverse().find((message) => message.response)?.response;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Hỏi dữ liệu kinh doanh
            </CardTitle>
            <CardDescription>AI dùng dữ liệu bán hàng, lãi lỗ, kênh bán và tài liệu đã upload để trả lời có nguồn.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <Button key={prompt} type="button" variant="outline" size="sm" onClick={() => submit(prompt)} disabled={isAsking}>
                  {prompt}
                </Button>
              ))}
            </div>

            <div className="min-h-[280px] space-y-3 rounded-md border bg-muted/20 p-3">
              {messages.length === 0 ? (
                <div className="flex h-[240px] items-center justify-center text-center text-sm text-muted-foreground">
                  Chọn một câu hỏi gợi ý hoặc nhập câu hỏi về doanh thu, lãi lỗ, món bán chạy, kênh bán.
                </div>
              ) : (
                messages.map((message, index) => (
                  <div
                    key={index}
                    className={message.role === "user" ? "ml-auto max-w-[82%] rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" : "max-w-[88%] rounded-md border bg-background px-3 py-2 text-sm"}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    {message.response?.bullets?.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-4">
                        {message.response.bullets.map((bullet, i) => <li key={i}>{bullet}</li>)}
                      </ul>
                    ) : null}
                    {message.response?.usedFallback ? (
                      <p className="mt-2 text-xs text-amber-700">
                        Đang dùng fallback nội bộ
                        {message.response.fallbackReason ? `: ${message.response.fallbackReason}` : " vì chưa cấu hình API AI hoặc nhà cung cấp đang lỗi."}
                      </p>
                    ) : null}
                  </div>
                ))
              )}
              {isAsking ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang phân tích dữ liệu...
                </div>
              ) : null}
            </div>

            <div className="flex gap-2">
              <Textarea
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    submit();
                  }
                }}
                placeholder="Ví dụ: Lãi sau phí hôm nay đến từ kênh nào nhiều nhất?"
                className="min-h-[52px]"
              />
              <Button type="button" className="h-auto px-4" onClick={() => submit()} disabled={isAsking || !question.trim()}>
                {isAsking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Gửi
              </Button>
            </div>
          </CardContent>
        </Card>

        <ChartSpecRenderer chart={latestResponse?.chart ?? null} />

        {latestResponse?.sources?.length ? (
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle>Nguồn dữ liệu</CardTitle>
                  <CardDescription>Các nguồn AI đã dùng để tạo câu trả lời.</CardDescription>
                </div>
                <Badge variant="outline">{latestResponse.sources.length} nguồn</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 lg:grid-cols-2">
              {latestResponse.sources.map((source) => (
                <div key={source.id} className="rounded-md border bg-background p-3 text-sm shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-semibold text-primary-foreground">
                          {source.id}
                        </span>
                        <p className="truncate font-semibold">{source.label}</p>
                      </div>
                      {source.detail ? <p className="text-xs text-muted-foreground">{source.detail}</p> : null}
                    </div>
                    <Badge variant={source.type === "analytics" ? "info" : "secondary"}>
                      {source.type === "analytics" ? "Dữ liệu" : "Tài liệu"}
                    </Badge>
                  </div>
                  <SourcePreview source={source} />
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Tài liệu AI</CardTitle>
            <CardDescription>Upload ghi chú, CSV hoặc JSON để AI có thêm ngữ cảnh.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              ref={fileInputRef}
              type="file"
              accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json"
              onChange={(event) => onUpload(event.target.files?.[0])}
              disabled={isUploading}
            />
            <Button type="button" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload tài liệu
            </Button>
            <p className="text-xs text-muted-foreground">Mỗi tệp được chuẩn hóa và chia đoạn để trích dẫn lại khi trả lời.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tệp đã upload</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {documents.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">Chưa có tài liệu.</p>
            ) : (
              documents.map((document) => (
                <div key={document.id} className="flex items-start gap-2 rounded-md border p-3 text-sm">
                  <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{document.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{document.file_name}</p>
                    <p className="text-xs text-muted-foreground">{formatDateTime(document.created_at)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
