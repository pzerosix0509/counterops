import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { extractSearchTerms } from "@/lib/ai/chunk";
import type { AiAnalyticsContext, AiChartSpec, AiSource } from "@/types/ai";
import type { AiDocument } from "@/types/database";

export async function listAiDocuments(organizationId: string): Promise<AiDocument[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_documents")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function searchAiDocumentChunks(organizationId: string, question: string): Promise<AiSource[]> {
  const supabase = createSupabaseServerClient();
  const terms = extractSearchTerms(question);
  if (terms.length === 0) return [];
  const orFilter = terms.map((term) => `content.ilike.%${term}%`).join(",");
  const { data, error } = await supabase
    .from("ai_document_chunks")
    .select("id, chunk_index, content, ai_documents!inner(title, file_name)")
    .eq("organization_id", organizationId)
    .or(orFilter)
    .limit(6);
  if (error) return [];
  return (data ?? []).map((row: any) => ({
    id: row.id,
    type: "document",
    label: row.ai_documents?.title ?? row.ai_documents?.file_name ?? "Tài liệu",
    detail: `Đoạn ${Number(row.chunk_index) + 1}`,
    excerpt: String(row.content ?? "").slice(0, 420),
  }));
}

export function inferAiDateRange(question: string, now = new Date()) {
  const q = question.toLowerCase();
  const start = new Date(now);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);

  if (q.includes("tháng này") || q.includes("this month")) {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: end.toISOString(), label: "Tháng này" };
  }
  if (q.includes("hôm nay") || q.includes("today")) {
    start.setHours(0, 0, 0, 0);
    return { from: start.toISOString(), to: end.toISOString(), label: "Hôm nay" };
  }
  if (q.includes("hôm qua") || q.includes("yesterday")) {
    start.setDate(start.getDate() - 1);
    start.setHours(0, 0, 0, 0);
    end.setDate(end.getDate() - 1);
    end.setHours(23, 59, 59, 999);
    return { from: start.toISOString(), to: end.toISOString(), label: "Hôm qua" };
  }
  start.setDate(start.getDate() - 6);
  start.setHours(0, 0, 0, 0);
  return { from: start.toISOString(), to: end.toISOString(), label: "7 ngày qua" };
}

export async function getAiAnalyticsContext(args: {
  organizationId: string;
  branchId: string;
  question: string;
}): Promise<AiAnalyticsContext> {
  const supabase = createSupabaseServerClient();
  const range = inferAiDateRange(args.question);
  const [{ data: sales }, { data: products }, { data: channels }] = await Promise.all([
    supabase.rpc("ai_sales_summary", {
      p_org_id: args.organizationId,
      p_branch_id: args.branchId,
      p_from: range.from,
      p_to: range.to,
    }),
    supabase.rpc("ai_top_products", {
      p_org_id: args.organizationId,
      p_branch_id: args.branchId,
      p_from: range.from,
      p_to: range.to,
      p_limit: 10,
    }),
    supabase.rpc("ai_channel_summary", {
      p_org_id: args.organizationId,
      p_branch_id: args.branchId,
      p_from: range.from,
      p_to: range.to,
    }),
  ]);
  return {
    range,
    salesSummary: (sales?.[0] as AiAnalyticsContext["salesSummary"]) ?? null,
    topProducts: (products ?? []) as AiAnalyticsContext["topProducts"],
    channelSummary: (channels ?? []) as AiAnalyticsContext["channelSummary"],
  };
}

export function buildChartForQuestion(question: string, analytics: AiAnalyticsContext): AiChartSpec | null {
  const q = question.toLowerCase();
  if ((q.includes("kênh") || q.includes("channel")) && analytics.channelSummary.length > 0) {
    return {
      type: "bar",
      title: `Doanh thu theo kênh bán - ${analytics.range.label}`,
      xKey: "channel",
      yKey: "revenue",
      data: analytics.channelSummary.map((row) => ({
        channel: row.channel_name,
        revenue: Number(row.revenue),
        fees: Number(row.channel_fees),
      })),
    };
  }
  if ((q.includes("món") || q.includes("sản phẩm") || q.includes("top") || q.includes("product")) && analytics.topProducts.length > 0) {
    return {
      type: "bar",
      title: `Top món theo doanh thu - ${analytics.range.label}`,
      xKey: "product",
      yKey: "revenue",
      data: analytics.topProducts.slice(0, 8).map((row) => ({
        product: row.product_name,
        revenue: Number(row.revenue),
        profit: Number(row.gross_profit),
      })),
    };
  }
  if (analytics.salesSummary) {
    return {
      type: "bar",
      title: `Doanh thu, giá vốn, lợi nhuận - ${analytics.range.label}`,
      xKey: "metric",
      yKey: "value",
      data: [
        { metric: "Doanh thu", value: Number(analytics.salesSummary.net_revenue) },
        { metric: "Giá vốn", value: Number(analytics.salesSummary.cost_of_goods) },
        { metric: "Lãi sau phí", value: Number(analytics.salesSummary.net_profit) },
      ],
    };
  }
  return null;
}
