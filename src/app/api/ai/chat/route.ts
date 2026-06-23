import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canViewReports, getActiveMembership, requireActiveContext } from "@/lib/auth/permissions";
import { buildChartForQuestion, getAiAnalyticsContext, searchAiDocumentChunks } from "@/server/queries/ai";
import { formatVND } from "@/lib/date/ranges";
import type { AiAnalyticsContext, AiChatResponse, AiSource } from "@/types/ai";

const requestSchema = z.object({
  question: z.string().trim().min(2).max(1000),
});

interface ModelAnswer {
  answer: string;
  bullets: string[];
  model: string;
}

interface ModelCallResult {
  answer: ModelAnswer | null;
  error?: string;
}

function renumberSources(sources: Omit<AiSource, "id">[]): AiSource[] {
  return sources.map((source, index) => ({ ...source, id: `S${index + 1}` }));
}

function buildSources(analytics: AiAnalyticsContext, documentSources: AiSource[]): AiSource[] {
  const analyticsSources: Omit<AiSource, "id">[] = [];
  if (analytics.salesSummary) {
    analyticsSources.push({
      type: "analytics",
      label: "Tổng hợp bán hàng",
      detail: analytics.range.label,
      excerpt: JSON.stringify(analytics.salesSummary),
    });
  }
  if (analytics.topProducts.length > 0) {
    analyticsSources.push({
      type: "analytics",
      label: "Top món bán chạy",
      detail: analytics.range.label,
      excerpt: JSON.stringify(analytics.topProducts.slice(0, 10)),
    });
  }
  if (analytics.channelSummary.length > 0) {
    analyticsSources.push({
      type: "analytics",
      label: "Doanh thu theo kênh bán",
      detail: analytics.range.label,
      excerpt: JSON.stringify(analytics.channelSummary),
    });
  }
  return renumberSources([...analyticsSources, ...documentSources.map(({ id: _id, ...source }) => source)]);
}

function sourceSuffix(sources: AiSource[]): string {
  return sources.length > 0 ? ` Nguồn: ${sources.map((source) => `[${source.id}]`).join(", ")}.` : "";
}

function buildFallbackAnswer(
  question: string,
  analytics: AiAnalyticsContext,
  sources: AiSource[],
  fallbackReason?: string
): AiChatResponse {
  const q = question.toLowerCase();
  const summary = analytics.salesSummary;
  const topProduct = analytics.topProducts[0];
  const topProfitProduct = [...analytics.topProducts].sort((a, b) => Number(b.gross_profit) - Number(a.gross_profit))[0];
  const topChannel = analytics.channelSummary[0];
  const documentSources = sources.filter((source) => source.type === "document");

  let bullets: string[];
  if (/^(hi|hello|chào|xin chào)\b/.test(q)) {
    bullets = [
      "Mình có thể trả lời về doanh thu, lãi lỗ, món bán chạy, kênh bán và tài liệu đã upload.",
      "Hiện câu trả lời này dùng fallback nội bộ; xem lý do fallback ở dòng cảnh báo bên dưới.",
    ];
  } else if (q.includes("tài liệu") || q.includes("upload") || q.includes("document")) {
    bullets = documentSources.length > 0
      ? documentSources.map((source) => `${source.label}: ${source.excerpt ?? "Có dữ liệu liên quan."}`).slice(0, 4)
      : ["Chưa có tài liệu upload phù hợp với câu hỏi này."];
  } else if (q.includes("lãi") || q.includes("lỗ") || q.includes("profit")) {
    bullets = [
      summary
        ? `Lãi sau phí trong ${analytics.range.label.toLowerCase()} là ${formatVND(Number(summary.net_profit))}; lãi gộp là ${formatVND(Number(summary.gross_profit))}.`
        : `Chưa có dữ liệu lãi lỗ trong ${analytics.range.label.toLowerCase()}.`,
      topProfitProduct
        ? `Món có lãi gộp cao nhất là ${topProfitProduct.product_name}: ${formatVND(Number(topProfitProduct.gross_profit))}.`
        : "Chưa có dữ liệu lãi theo món.",
    ];
  } else if (q.includes("món") || q.includes("sản phẩm") || q.includes("top") || q.includes("bán chạy")) {
    bullets = analytics.topProducts.slice(0, 5).map((product, index) =>
      `${index + 1}. ${product.product_name}: doanh thu ${formatVND(Number(product.revenue))}, lãi gộp ${formatVND(Number(product.gross_profit))}.`
    );
    if (bullets.length === 0) bullets = ["Chưa có dữ liệu món bán trong kỳ."];
  } else if (q.includes("kênh") || q.includes("grab") || q.includes("shopee") || q.includes("channel")) {
    bullets = analytics.channelSummary.map((channel) =>
      `${channel.channel_name}: ${formatVND(Number(channel.revenue))}, ${channel.orders} đơn, phí nền tảng ${formatVND(Number(channel.channel_fees))}.`
    );
    if (bullets.length === 0) bullets = ["Chưa có dữ liệu kênh bán trong kỳ."];
  } else {
    bullets = [
      summary
        ? `Trong ${analytics.range.label.toLowerCase()}, doanh thu thuần là ${formatVND(Number(summary.net_revenue))}, lãi sau phí là ${formatVND(Number(summary.net_profit))}.`
        : `Chưa có dữ liệu doanh thu trong ${analytics.range.label.toLowerCase()}.`,
      topProduct ? `Món đóng góp doanh thu cao nhất là ${topProduct.product_name}: ${formatVND(Number(topProduct.revenue))}.` : "Chưa có dữ liệu món bán trong kỳ.",
      topChannel ? `Kênh bán nổi bật là ${topChannel.channel_name}: ${formatVND(Number(topChannel.revenue))}.` : "Chưa có dữ liệu kênh bán trong kỳ.",
    ];
  }

  return {
    answer: `${bullets.join(" ")}${sourceSuffix(sources)}`,
    bullets,
    chart: null,
    sources,
    modelUsed: null,
    usedFallback: true,
    fallbackReason,
  };
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string") return payload.output_text;
  const responsesParts = payload?.output
    ?.flatMap((item: any) => item?.content ?? [])
    ?.map((content: any) => content?.text)
    ?.filter(Boolean);
  if (Array.isArray(responsesParts) && responsesParts.length > 0) return responsesParts.join("\n");
  const chatContent = payload?.choices?.[0]?.message?.content;
  return typeof chatContent === "string" ? chatContent : "";
}

function parseModelText(text: string): { answer: string; bullets: string[] } | null {
  const raw = text.trim().replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return {
      answer: String(parsed.answer ?? ""),
      bullets: Array.isArray(parsed.bullets) ? parsed.bullets.map(String).slice(0, 6) : [],
    };
  } catch {
    const bullets = raw
      .split(/\n+/)
      .map((line) => line.replace(/^[-*•\d.\s]+/, "").trim())
      .filter(Boolean)
      .slice(0, 6);
    return { answer: raw, bullets };
  }
}

function buildModelMessages(question: string, analytics: AiAnalyticsContext, sources: AiSource[]) {
  const context = {
    analytics,
    sources: sources.map((source) => ({
      id: source.id,
      type: source.type,
      label: source.label,
      detail: source.detail,
      excerpt: source.excerpt,
    })),
  };
  return [
    {
      role: "system",
      content:
        "Bạn là trợ lý phân tích dữ liệu cho quán cafe/nhà hàng. Chỉ dùng dữ liệu trong context. Nếu thiếu dữ liệu, nói rõ thiếu. Luôn trích nguồn bằng mã [S1], [S2]. Ưu tiên trả về JSON hợp lệ dạng {\"answer\":\"...\",\"bullets\":[\"...\"]}.",
    },
    {
      role: "user",
      content: `Câu hỏi: ${question}\n\nContext JSON:\n${JSON.stringify(context)}`,
    },
  ];
}

async function readProviderError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  const body = text ? `: ${text.slice(0, 320)}` : "";
  return `${response.status} ${response.statusText}${body}`;
}

async function callOpenAi(question: string, analytics: AiAnalyticsContext, sources: AiSource[]): Promise<ModelCallResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { answer: null, error: "Thiếu OPENAI_API_KEY." };
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const messages = buildModelMessages(question, analytics, sources);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: messages,
    }),
  });
  if (!response.ok) return { answer: null, error: `OpenAI API lỗi ${await readProviderError(response)}` };
  const parsed = parseModelText(extractOutputText(await response.json()));
  return parsed?.answer ? { answer: { ...parsed, model } } : { answer: null, error: "OpenAI không trả nội dung hợp lệ." };
}

async function callMiniMax(question: string, analytics: AiAnalyticsContext, sources: AiSource[]): Promise<ModelCallResult> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) return { answer: null, error: "Thiếu MINIMAX_API_KEY." };
  const model = process.env.MINIMAX_MODEL || "MiniMax-M3";
  const baseUrl = (process.env.MINIMAX_BASE_URL || "https://api.minimax.io/v1").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: buildModelMessages(question, analytics, sources),
      temperature: 0.2,
    }),
  });
  if (!response.ok) return { answer: null, error: `MiniMax API lỗi ${await readProviderError(response)}` };
  const parsed = parseModelText(extractOutputText(await response.json()));
  return parsed?.answer ? { answer: { ...parsed, model } } : { answer: null, error: "MiniMax không trả nội dung hợp lệ." };
}

async function callNvidia(question: string, analytics: AiAnalyticsContext, sources: AiSource[]): Promise<ModelCallResult> {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return { answer: null, error: "Thiếu NVIDIA_API_KEY." };
  const model = process.env.NVIDIA_MODEL || "minimaxai/minimax-m3";
  const baseUrl = (process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: buildModelMessages(question, analytics, sources),
      max_tokens: 8192,
      temperature: 0.2,
      top_p: 0.95,
      stream: false,
    }),
  });
  if (!response.ok) return { answer: null, error: `NVIDIA API lỗi ${await readProviderError(response)}` };
  const parsed = parseModelText(extractOutputText(await response.json()));
  return parsed?.answer ? { answer: { ...parsed, model } } : { answer: null, error: "NVIDIA không trả nội dung hợp lệ." };
}

async function callAiModel(question: string, analytics: AiAnalyticsContext, sources: AiSource[]): Promise<ModelCallResult> {
  const provider = (process.env.AI_PROVIDER || "").toLowerCase();
  if (provider === "nvidia") return callNvidia(question, analytics, sources);
  if (provider === "minimax") return callMiniMax(question, analytics, sources);
  if (provider === "openai") return callOpenAi(question, analytics, sources);
  const nvidia = await callNvidia(question, analytics, sources);
  if (nvidia.answer) return nvidia;
  const miniMax = await callMiniMax(question, analytics, sources);
  if (miniMax.answer) return miniMax;
  const openAi = await callOpenAi(question, analytics, sources);
  return openAi.answer ? openAi : { answer: null, error: `${nvidia.error ?? ""} ${miniMax.error ?? ""} ${openAi.error ?? ""}`.trim() };
}

export async function POST(request: NextRequest) {
  const active = await getActiveMembership();
  if (!active) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!canViewReports.includes(active.role)) {
    return NextResponse.json({ error: "Bạn không có quyền dùng trợ lý AI." }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = requestSchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Câu hỏi không hợp lệ." }, { status: 400 });

  const ctx = await requireActiveContext();
  const [analytics, documentSources] = await Promise.all([
    getAiAnalyticsContext({ organizationId: ctx.organizationId, branchId: ctx.branchId, question: parsed.data.question }),
    searchAiDocumentChunks(ctx.organizationId, parsed.data.question),
  ]);
  const sources = buildSources(analytics, documentSources);
  const chart = buildChartForQuestion(parsed.data.question, analytics);

  const modelResult = await callAiModel(parsed.data.question, analytics, sources).catch((error) => ({
    answer: null,
    error: error instanceof Error ? error.message : "Không gọi được API AI.",
  }));
  if (modelResult.answer) {
    return NextResponse.json({
      answer: modelResult.answer.answer,
      bullets: modelResult.answer.bullets,
      chart,
      sources,
      modelUsed: modelResult.answer.model,
      usedFallback: false,
    } satisfies AiChatResponse);
  }

  const fallback = buildFallbackAnswer(parsed.data.question, analytics, sources, modelResult.error);
  return NextResponse.json({ ...fallback, chart } satisfies AiChatResponse);
}
