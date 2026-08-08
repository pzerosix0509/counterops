"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bot, Database, FileText, History, Loader2, Plus, Save, Send, ThumbsDown, ThumbsUp, Upload } from "lucide-react";
import { uploadAiDocument } from "@/server/actions/ai-documents";
import { saveAiDashboardTemplate } from "@/server/actions/ai-dashboards";
import { submitAiMessageFeedback } from "@/server/actions/ai-feedback";
import { AiDashboardRenderer } from "@/components/ai/ai-dashboard-renderer";
import { ChartSpecRenderer } from "@/components/ai/chart-spec-renderer";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import { formatVND } from "@/lib/date/ranges";
import { formatDateTime } from "@/lib/utils/format";
import type {
  AiChatResponse,
  AiChatSessionSummary,
  AiDashboardSpec,
  AiSource,
  AiStoredChatMessage,
  AiStreamEvent,
  AiUsageSummary,
} from "@/types/ai";
import type { AiDashboardTemplate, AiDocument } from "@/types/database";

const SUGGESTED_PROMPTS = [
  "Doanh thu 7 ngày qua thế nào?",
  "Top món có lãi tốt nhất tháng này?",
  "Tạo dashboard quản trị 7 ngày qua",
  "Tóm tắt tài liệu đã upload liên quan đến kho.",
];

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  response?: AiChatResponse;
  feedback: -1 | 1 | null;
}

async function readAiStream(
  response: Response,
  onProgress: (message: string) => void,
): Promise<AiChatResponse> {
  if (!response.body) throw new Error("AI không trả về luồng dữ liệu.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: AiChatResponse | null = null;

  while (true) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line) as AiStreamEvent;
      if (event.type === "progress") onProgress(event.message);
      if (event.type === "error") throw new Error(event.error);
      if (event.type === "result") result = event.data;
    }
    if (done) break;
  }
  if (!result) throw new Error("Luồng AI kết thúc mà không có kết quả.");
  return result;
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
    period_start: "Thời gian",
    category_name: "Nhóm món",
    product_name: "Món",
    channel_name: "Kênh",
    item_name: "Hàng hóa",
    quantity_on_hand: "Tồn",
    low_stock_threshold: "Mức thấp",
    status: "Trạng thái",
    current_revenue: "Doanh thu kỳ này",
    previous_revenue: "Doanh thu kỳ trước",
    revenue_delta_percent: "Thay đổi",
  };
  return labels[key] ?? key.replace(/_/g, " ");
}

function formatSourceValue(key: string, value: unknown): string {
  if (key === "period_start" && typeof value === "string") return formatDateTime(value);
  if (key.includes("percent") && typeof value === "number") return `${value > 0 ? "+" : ""}${value}%`;
  if (typeof value !== "number") return String(value ?? "-");
  if (key.includes("revenue") || key.includes("cost") || key.includes("profit") || key.includes("fee")) {
    return formatVND(value);
  }
  return value.toLocaleString("vi-VN");
}

function sourceColumns(rows: Array<Record<string, unknown>>) {
  const first = rows[0] ?? {};
  if ("period_start" in first) return ["period_start", "total_orders", "net_revenue", "net_profit"];
  if ("category_name" in first) return ["category_name", "quantity", "revenue", "gross_profit"];
  if ("product_name" in first) return ["product_name", "quantity", "revenue", "gross_profit"];
  if ("channel_name" in first) return ["channel_name", "orders", "revenue", "channel_fees"];
  if ("item_name" in first) return ["item_name", "quantity_on_hand", "low_stock_threshold", "status"];
  return Object.keys(first).slice(0, 4);
}

function SourcePreview({ source }: { source: AiSource }) {
  const parsed = parseSourceExcerpt(source);
  if (source.type === "document") {
    return <p className="mt-3 line-clamp-4 rounded-md bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">{typeof parsed === "string" ? parsed : source.excerpt}</p>;
  }
  if (parsed && !Array.isArray(parsed) && typeof parsed === "object") {
    return (
      <div className="mt-3 grid grid-cols-2 gap-2">
        {Object.entries(parsed as Record<string, unknown>).map(([key, value]) => (
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
    const columns = sourceColumns(rows);
    return (
      <div className="mt-3 overflow-hidden rounded-md border">
        <table className="w-full text-xs">
          <thead className="bg-muted/60 text-muted-foreground">
            <tr>
              {columns.map((column, index) => (
                <th key={column} className={`px-2 py-1.5 ${index === 0 ? "text-left" : "text-right"}`}>
                  {metricLabel(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-t">
                {columns.map((column, columnIndex) => (
                  <td
                    key={column}
                    className={`px-2 py-1.5 ${columnIndex === 0 ? "max-w-[180px] truncate text-left font-medium" : "text-right"}`}
                  >
                    {formatSourceValue(column, row[column])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return source.excerpt ? <p className="mt-3 line-clamp-4 rounded-md bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">{source.excerpt}</p> : null;
}

function SourceDetailDialog({ source }: { source: AiSource }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm">Chi tiết</Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>[{source.id}] {source.label}</DialogTitle>
          <DialogDescription>{source.detail ?? "Nguồn dữ liệu AI đã dùng trong câu trả lời."}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Metadata / query</p>
            <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-xs">{JSON.stringify(source.meta ?? {}, null, 2)}</pre>
          </div>
          <div className="rounded-md border bg-muted/20 p-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">Dữ liệu gốc</p>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap text-xs">{source.excerpt ?? "Không có excerpt."}</pre>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SourcesPanel({ sources }: { sources: AiSource[] }) {
  if (sources.length === 0) return null;
  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Nguồn dữ liệu</CardTitle>
            <CardDescription>Click chi tiết để xem RPC/query, thời gian lọc và dữ liệu gốc.</CardDescription>
          </div>
          <Badge variant="outline">{sources.length} nguồn</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 lg:grid-cols-2">
        {sources.map((source) => (
          <div key={source.id} className="min-w-0 rounded-md border bg-background p-3 text-sm shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <Badge>{source.id}</Badge>
                  <p className="truncate font-semibold">{source.label}</p>
                </div>
                {source.detail ? <p className="text-xs text-muted-foreground">{source.detail}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={source.type === "analytics" ? "info" : "secondary"}>{source.type === "analytics" ? "Dữ liệu" : "Tài liệu"}</Badge>
                <SourceDetailDialog source={source} />
              </div>
            </div>
            <SourcePreview source={source} />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function AiAssistant({
  organizationId,
  branchId,
  documents,
  dashboardTemplates,
  chatSessions,
  initialSessionId,
  initialMessages,
  usageSummary,
}: {
  organizationId: string;
  branchId: string;
  documents: AiDocument[];
  dashboardTemplates: AiDashboardTemplate[];
  chatSessions: AiChatSessionSummary[];
  initialSessionId: string | null;
  initialMessages: AiStoredChatMessage[];
  usageSummary: AiUsageSummary;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const [question, setQuestion] = useState("");
  const [attachedImage, setAttachedImage] = useState<{ data: string; mime: string; name: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => initialMessages.map((message) => ({
    id: message.id,
    role: message.role,
    content: message.content,
    response: message.response ?? undefined,
    feedback: message.feedback,
  })));
  const [sessions, setSessions] = useState(chatSessions);
  const [sessionId, setSessionId] = useState<string | null>(initialSessionId);
  const [usage, setUsage] = useState(usageSummary);
  const [isAsking, setIsAsking] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isUploading, startUpload] = useTransition();
  const [isSaving, startSave] = useTransition();
  const draftKey = `counterops:ai-draft:${branchId}`;

  useEffect(() => {
    setSessions(chatSessions);
  }, [chatSessions]);

  useEffect(() => {
    const savedDraft = window.localStorage.getItem(draftKey);
    if (savedDraft) setQuestion(savedDraft);
  }, [draftKey]);

  useEffect(() => {
    if (question) window.localStorage.setItem(draftKey, question);
    else window.localStorage.removeItem(draftKey);
  }, [draftKey, question]);

  function startNewConversation() {
    setSessionId(null);
    setMessages([]);
    setQuestion("");
  }

  function loadConversation(nextSessionId: string) {
    if (nextSessionId === sessionId || isLoadingSession) return;
    setIsLoadingSession(true);
    fetch(`/api/ai/sessions/${nextSessionId}`)
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error ?? "Không tải được cuộc trò chuyện.");
        return payload.messages as AiStoredChatMessage[];
      })
      .then((storedMessages) => {
        setSessionId(nextSessionId);
        setMessages(storedMessages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          response: message.response ?? undefined,
          feedback: message.feedback,
        })));
      })
      .catch((error) => notifyError("Không tải được hội thoại", error instanceof Error ? error.message : "Có lỗi xảy ra."))
      .finally(() => setIsLoadingSession(false));
  }

  function updateSessionList(response: AiChatResponse, firstQuestion: string) {
    const now = new Date().toISOString();
    setSessions((current) => {
      const existing = current.find((session) => session.id === response.sessionId);
      const updated: AiChatSessionSummary = existing
        ? { ...existing, messageCount: existing.messageCount + 2, lastMessageAt: now }
        : {
          id: response.sessionId,
          title: firstQuestion.length > 72 ? `${firstQuestion.slice(0, 69)}...` : firstQuestion,
          mode: response.dashboard ? "dashboard" : "chat",
          messageCount: 2,
          lastMessageAt: now,
          createdAt: now,
        };
      return [updated, ...current.filter((session) => session.id !== response.sessionId)];
    });
  }

  function updateUsage(response: AiChatResponse) {
    setUsage((current) => ({
      ...current,
      totalRuns: current.totalRuns + 1,
      totalTokens: current.totalTokens + (response.usage?.totalTokens ?? 0),
      estimatedCostUsd: current.estimatedCostUsd + (response.usage?.estimatedCostUsd ?? 0),
      fallbackRuns: current.fallbackRuns + (response.usedFallback ? 1 : 0),
    }));
  }

  function onImageSelect(file: File | undefined) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      notifyError("Ảnh không hợp lệ", "Chỉ chấp nhận JPG, PNG, WebP hoặc GIF.");
      return;
    }
    if (file.size > 4 * 1024 * 1024) {
      notifyError("Ảnh quá lớn", "Ảnh tối đa 4MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result ?? "").split(",")[1] ?? "";
      setAttachedImage({ data, mime: file.type, name: file.name });
    };
    reader.readAsDataURL(file);
  }

  function ask(nextQuestion = question) {
    const text = nextQuestion.trim();
    if ((!text && !attachedImage) || isAsking) return;
    const image = attachedImage ?? undefined;
    setQuestion("");
    setAttachedImage(null);
    setIsAsking(true);
    setProgressMessage("Đang chuẩn bị phân tích...");
    const requestId = crypto.randomUUID();
    setMessages((current) => [...current, { id: requestId, role: "user", content: text || "[Ảnh đã gửi]", feedback: null }]);
    fetch("/api/ai/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: text,
        mode: "chat",
        sessionId: sessionId ?? undefined,
        requestId,
        stream: true,
        image: image ? { data: image.data, mime: image.mime } : undefined,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => null);
          throw new Error(payload?.error ?? "Không thể hỏi AI.");
        }
        return readAiStream(res, setProgressMessage);
      })
      .then((payload) => {
        setSessionId(payload.sessionId);
        updateSessionList(payload, text);
        updateUsage(payload);
        setMessages((current) => [...current, {
          id: payload.messageId,
          role: "assistant",
          content: payload.answer,
          response: payload,
          feedback: null,
        }]);
      })
      .catch((error) => notifyError("AI trả lời thất bại", error instanceof Error ? error.message : "Có lỗi xảy ra."))
      .finally(() => {
        setIsAsking(false);
        setProgressMessage(null);
      });
  }

  function saveDashboard(spec: AiDashboardSpec | null, prompt: string) {
    if (!spec) return;
    startSave(async () => {
      const result = await saveAiDashboardTemplate(organizationId, {
        branchId,
        name: spec.title,
        description: spec.description ?? null,
        prompt,
        spec,
      });
      if (!result.ok) {
        notifyError("Lưu dashboard thất bại", result.error.message);
        return;
      }
      notifySuccess("Đã lưu dashboard", spec.title);
      router.refresh();
    });
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
        notifySuccess("Đã upload tài liệu", `${result.data.chunks} đoạn, ${result.data.embedded} embedding.`);
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      } catch (error) {
        notifyError("Không đọc được tệp", error instanceof Error ? error.message : "Vui lòng thử lại.");
      }
    });
  }

  function submitFeedback(messageId: string, rating: -1 | 1) {
    startSave(async () => {
      const result = await submitAiMessageFeedback(organizationId, { messageId, rating });
      if (!result.ok) {
        notifyError("Không lưu được đánh giá", result.error.message);
        return;
      }
      setMessages((current) => current.map((message) =>
        message.id === messageId ? { ...message, feedback: rating } : message,
      ));
      notifySuccess("Đã ghi nhận đánh giá");
    });
  }

  return (
    <div className="flex min-h-[600px] flex-col-reverse gap-6 xl:h-[calc(100vh-10rem)] xl:flex-row">
      {/* Sidebar: History, Stats, v.v */}
      <div className="w-full xl:w-[320px] flex flex-col gap-4 overflow-y-auto pb-4 pr-1 scrollbar-thin">
        <Card className="border-none shadow-md bg-gradient-to-br from-primary/5 to-transparent overflow-hidden">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-primary"></span>
              Tổng quan 30 ngày
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 text-sm px-4 pb-4">
            <div className="bg-background/50 rounded-lg p-2 border border-border/50">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Lượt chạy</p>
              <p className="font-semibold text-lg">{usage.totalRuns.toLocaleString("vi-VN")}</p>
            </div>
            <div className="bg-background/50 rounded-lg p-2 border border-border/50">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Tokens</p>
              <p className="font-semibold text-lg">{usage.totalTokens.toLocaleString("vi-VN")}</p>
            </div>
            <div className="bg-background/50 rounded-lg p-2 border border-border/50">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Fallback</p>
              <p className="font-semibold text-lg">{usage.fallbackRuns.toLocaleString("vi-VN")}</p>
            </div>
            <div className="bg-background/50 rounded-lg p-2 border border-border/50">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">Chi phí</p>
              <p className="font-semibold text-lg">${usage.estimatedCostUsd.toFixed(4)}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm flex-shrink-0">
          <CardHeader className="pb-2 pt-4 px-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <History className="h-4 w-4 text-muted-foreground" />
                Lịch sử hội thoại
              </CardTitle>
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7 rounded-full" title="Cuộc trò chuyện mới" onClick={startNewConversation}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex max-h-[240px] flex-col gap-1 overflow-y-auto px-2 pb-2">
            {sessions.length === 0 ? (
              <p className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground m-2">Chưa có hội thoại.</p>
            ) : sessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => loadConversation(session.id)}
                className={`rounded-lg px-3 py-2.5 text-left transition-all hover:bg-muted group ${session.id === sessionId ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground"}`}
              >
                <span className="block truncate text-sm mb-0.5 group-hover:text-foreground">{session.title}</span>
                <span className="text-[10px] opacity-70 flex justify-between">
                  <span>{session.messageCount} tin</span>
                  <span>{formatDateTime(session.lastMessageAt)}</span>
                </span>
              </button>
            ))}
            {isLoadingSession ? (
              <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Đang tải...
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-sm font-bold flex items-center gap-2">
              <Upload className="h-4 w-4 text-muted-foreground" />
              Nguồn dữ liệu
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 px-4 pb-4">
            <Input ref={fileInputRef} type="file" accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json" onChange={(event) => onUpload(event.target.files?.[0])} disabled={isUploading} className="hidden" />
            <Button type="button" variant="outline" className="w-full rounded-xl border-dashed bg-muted/30 hover:bg-muted/60" onClick={() => fileInputRef.current?.click()} disabled={isUploading}>
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
              Upload tài liệu mới
            </Button>

            <div className="flex flex-col gap-2 mt-1">
              {documents.length === 0 ? (
                <p className="text-[11px] text-center text-muted-foreground py-2">Chưa có tài liệu nền.</p>
              ) : (
                <div className="max-h-[160px] overflow-y-auto pr-1 space-y-2">
                  {documents.map((document) => (
                    <div key={document.id} className="flex items-start gap-2.5 rounded-lg border bg-card p-2.5 shadow-sm group">
                      <div className="bg-primary/10 p-1.5 rounded-md text-primary mt-0.5">
                        <FileText className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium group-hover:text-primary transition-colors">{document.title}</p>
                        <p className="truncate text-[10px] text-muted-foreground mt-0.5">{document.file_name}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {dashboardTemplates.length > 0 && (
          <Card className="border-none shadow-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <Database className="h-4 w-4 text-muted-foreground" />
                Dashboards
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2 px-4 pb-4 max-h-[160px] overflow-y-auto">
              {dashboardTemplates.map((template) => (
                <div key={template.id} className="rounded-lg border bg-card p-2.5 shadow-sm">
                  <p className="text-xs font-medium truncate">{template.name}</p>
                  {template.description ? <p className="text-[10px] text-muted-foreground truncate mt-0.5">{template.description}</p> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Main AI workspace */}
      <div className="relative flex h-[calc(100svh-10rem)] min-h-[600px] w-full min-w-0 flex-none flex-col overflow-hidden rounded-2xl border bg-card shadow-sm xl:h-auto xl:min-h-0 xl:w-auto xl:flex-1">
          <div className="flex items-center px-4 py-3 border-b bg-muted/20">
            <div className="flex items-center gap-2">
              <div className="bg-primary/10 p-1.5 rounded-lg">
                <Bot className="h-5 w-5 text-primary" />
              </div>
              <span className="font-semibold tracking-tight">AI Trợ Lý</span>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0">
            {/* Message Area */}
            <div className="flex-1 overflow-x-hidden overflow-y-auto p-4 scroll-smooth md:p-6">
              <div className="max-w-5xl mx-auto flex flex-col gap-6 pb-4">
                {messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-6 animate-in fade-in zoom-in duration-500">
                    <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-inner">
                      <Bot className="h-8 w-8" />
                    </div>
                    <div className="space-y-2">
                      <h2 className="text-2xl font-bold tracking-tight">Chào bạn!</h2>
                      <p className="text-muted-foreground">Tôi có thể giúp bạn phân tích dữ liệu bán hàng, lợi nhuận, và các tài liệu tải lên.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((message) => (
                      <div key={message.id} className="flex flex-col gap-4 animate-in slide-in-from-bottom-2 fade-in duration-300">
                        <div className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                          <div className={`flex gap-3 max-w-[90%] md:max-w-[80%] ${message.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                            {message.role === "assistant" && (
                              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary mt-1 border border-primary/20">
                                <Bot className="h-4 w-4" />
                              </div>
                            )}
                            <div className={`group relative rounded-2xl px-5 py-3.5 text-sm shadow-sm ${
                              message.role === "user"
                                ? "bg-primary text-primary-foreground rounded-tr-sm"
                                : "bg-muted/30 border border-border/50 rounded-tl-sm"
                            }`}>
                              <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                              {message.response?.bullets?.length ? (
                                <ul className="mt-3 space-y-1.5 list-disc pl-5">
                                  {message.response.bullets.map((bullet, i) => <li key={i}>{bullet}</li>)}
                                </ul>
                              ) : null}
                              {message.response?.usedFallback ? (
                                <p className="mt-3 text-xs text-amber-600 font-medium flex items-center gap-1.5 bg-amber-500/10 p-2 rounded-md">
                                  <Loader2 className="h-3 w-3" />
                                  Đang dùng fallback nội bộ{message.response.fallbackReason ? `: ${message.response.fallbackReason}` : "."}
                                </p>
                              ) : null}
                              {message.response?.confidence ? (
                                <div className="mt-3 flex flex-wrap items-center gap-2">
                                  <Badge variant="outline">
                                    Độ tin cậy {Math.round(message.response.confidence.score * 100)}%
                                  </Badge>
                                  <Badge variant="secondary">
                                    {message.response.responseMode === "deterministic"
                                      ? "Từ dữ liệu hệ thống"
                                      : message.response.responseMode === "model" ? "AI phân tích" : "Fallback"}
                                  </Badge>
                                </div>
                              ) : null}
                              {message.response?.anomalies?.length ? (
                                <div className="mt-3 flex flex-col gap-1 rounded-md border bg-background/60 p-2 text-xs">
                                  {message.response.anomalies.slice(0, 2).map((anomaly) => (
                                    <p key={anomaly.code}>
                                      <span className="font-semibold">{anomaly.title}:</span> {anomaly.description}
                                    </p>
                                  ))}
                                </div>
                              ) : null}
                              {message.role === "assistant" ? (
                                <div className="mt-3 flex items-center gap-2 border-t border-border/50 pt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-full hover:bg-primary/10 hover:text-primary"
                                    onClick={() => submitFeedback(message.id, 1)}
                                  >
                                    <ThumbsUp className={`h-3.5 w-3.5 ${message.feedback === 1 ? "fill-current" : ""}`} />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-7 w-7 rounded-full hover:bg-destructive/10 hover:text-destructive"
                                    onClick={() => submitFeedback(message.id, -1)}
                                  >
                                    <ThumbsDown className={`h-3.5 w-3.5 ${message.feedback === -1 ? "fill-current" : ""}`} />
                                  </Button>
                                  {message.response?.usage?.totalTokens ? (
                                    <span className="ml-auto text-[10px] font-medium text-muted-foreground bg-background px-2 py-0.5 rounded-full border shadow-sm">
                                      {message.response.usage.totalTokens.toLocaleString("vi-VN")} tokens
                                    </span>
                                  ) : null}
                                  {message.response?.telemetry ? (
                                    <span className="text-[10px] text-muted-foreground">
                                      {(message.response.telemetry.responseReadyMs / 1000).toFixed(1)}s
                                      {message.response.telemetry.cacheHits > 0
                                        ? ` · ${message.response.telemetry.cacheHits} cache hit`
                                        : ""}
                                    </span>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </div>

                        {/* Inline renderers for each assistant message */}
                        {message.role === "assistant" && message.response && (
                          message.response.dashboard || message.response.chart || (message.response.sources && message.response.sources.length > 0)
                        ) ? (
                          <div className="flex justify-start">
                            <div className="flex gap-3 w-full">
                              <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary mt-1 border border-primary/20">
                                <Database className="h-4 w-4" />
                              </div>
                              <div className="flex-1 space-y-4 min-w-0">
                                {message.response.dashboard ? (
                                  <div className="flex justify-end">
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        const prompt = [...messages]
                                          .slice(0, messages.indexOf(message))
                                          .reverse()
                                          .find((m) => m.role === "user")?.content ?? "";
                                        saveDashboard(message.response!.dashboard, prompt);
                                      }}
                                      disabled={isSaving}
                                    >
                                      {isSaving
                                        ? <Loader2 data-icon="inline-start" className="animate-spin" />
                                        : <Save data-icon="inline-start" />}
                                      Lưu dashboard
                                    </Button>
                                  </div>
                                ) : null}
                                <AiDashboardRenderer dashboard={message.response.dashboard ?? null} />
                                <ChartSpecRenderer chart={message.response.chart ?? null} />
                                <SourcesPanel sources={message.response.sources ?? []} />
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    ))}

                    {isAsking && (
                      <div className="flex justify-start animate-in fade-in duration-300">
                        <div className="flex gap-3 max-w-[80%]">
                          <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary mt-1 border border-primary/20">
                            <Bot className="h-4 w-4 animate-pulse" />
                          </div>
                          <div className="bg-muted/30 border border-border/50 rounded-2xl rounded-tl-sm px-5 py-4 flex items-center gap-2 shadow-sm">
                            <span className="flex gap-1">
                              <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "0ms" }}></span>
                              <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "150ms" }}></span>
                              <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: "300ms" }}></span>
                            </span>
                            {progressMessage ? (
                              <span className="text-xs text-muted-foreground">{progressMessage}</span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* Input Area */}
            <div className="p-4 bg-background/80 backdrop-blur-xl border-t z-10 flex-shrink-0">
              <div className="max-w-5xl mx-auto space-y-3">
                <div className="flex flex-wrap gap-2 justify-center">
                  {SUGGESTED_PROMPTS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => { setQuestion(prompt); ask(prompt); }}
                      disabled={isAsking}
                      className="text-[11px] sm:text-xs bg-card border px-3 py-1.5 rounded-full hover:border-primary hover:shadow-sm transition-all hover:text-primary whitespace-nowrap"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                <div className="relative flex items-end gap-2 bg-muted/30 border rounded-3xl p-1.5 pl-4 shadow-sm focus-within:ring-1 focus-within:ring-primary focus-within:border-primary transition-all duration-200">
                  {attachedImage ? (
                    <div className="relative flex items-center gap-2 pr-1">
                      <img
                        src={`data:${attachedImage.mime};base64,${attachedImage.data}`}
                        alt="Ảnh đính kèm"
                        className="h-10 w-10 rounded-lg object-cover border"
                      />
                      <button
                        type="button"
                        aria-label="Gỡ ảnh"
                        onClick={() => setAttachedImage(null)}
                        className="absolute -top-1.5 -right-1.5 h-4 w-4 rounded-full bg-destructive text-white text-[10px] leading-none flex items-center justify-center hover:bg-destructive/80"
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                  <Textarea
                    value={question}
                    onChange={(event) => setQuestion(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        ask();
                      }
                    }}
                    placeholder="Hỏi bất cứ điều gì về dữ liệu..."
                    className="flex-1 min-h-[44px] max-h-[200px] border-0 bg-transparent shadow-none focus-visible:ring-0 p-3 resize-none py-3.5 text-sm"
                    rows={1}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-full mb-1 text-muted-foreground hover:text-foreground"
                    onClick={() => imageInputRef.current?.click()}
                    disabled={isAsking}
                    title="Đính kèm ảnh"
                  >
                    <FileText className="h-4 w-4" />
                  </Button>
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={(event) => onImageSelect(event.target.files?.[0])}
                  />
                  <Button
                    type="button"
                    size="icon"
                    className="h-10 w-10 shrink-0 rounded-full mb-1 mr-1 transition-transform active:scale-95"
                    onClick={() => ask()}
                    disabled={isAsking || (!question.trim() && !attachedImage)}
                  >
                    {isAsking ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="text-center">
                  <p className="text-[10px] text-muted-foreground">AI có thể mắc lỗi. Vui lòng kiểm tra lại các số liệu quan trọng.</p>
                </div>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
}
