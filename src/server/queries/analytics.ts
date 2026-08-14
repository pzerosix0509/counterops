import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ClusterProfile } from "@/lib/analytics/kmeans";
import type {
  ClusterCustomerRow,
  ClusterProfileRow,
  CustomerClustersView,
  FeedbackListRow,
  RfmCustomerRow,
  RfmSegment,
  RfmSummaryRow,
  SentimentSummary,
} from "@/types/analytics";

export const RFM_VS_CLUSTER_REMINDER = "RFM là value segment, cluster là hành vi";

function asSegment(value: string | null): RfmSegment | null {
  if (
    value === "Champions"
    || value === "Loyal Customers"
    || value === "Potential Loyalists"
    || value === "At Risk"
    || value === "Lost"
  ) {
    return value;
  }
  return null;
}

export async function getRfmSummary(
  organizationId: string,
  branchId: string,
): Promise<RfmSummaryRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_features")
    .select("rfm_segment, monetary")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId);
  if (error || !data) return [];

  const groups = new Map<string, { count: number; monetary: number }>();
  for (const row of data) {
    const key = row.rfm_segment ?? "";
    const group = groups.get(key) ?? { count: 0, monetary: 0 };
    group.count += 1;
    group.monetary += Number(row.monetary ?? 0);
    groups.set(key, group);
  }

  return Array.from(groups.entries()).map(([key, group]) => ({
    segment: asSegment(key || null),
    customerCount: group.count,
    avgMonetary: group.count === 0 ? 0 : group.monetary / group.count,
  }));
}

export async function getRfmCustomers(
  organizationId: string,
  branchId: string,
  segment?: RfmSegment,
): Promise<RfmCustomerRow[]> {
  const supabase = createSupabaseServerClient();
  let query = supabase
    .from("customer_features")
    .select(
      "customer_id, recency_days, frequency, monetary, r_score, f_score, m_score, rfm_segment",
    )
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .order("monetary", { ascending: false })
    .limit(100);
  if (segment) query = query.eq("rfm_segment", segment);

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map((row) => ({
    customerId: row.customer_id,
    recencyDays: Number(row.recency_days),
    frequency: Number(row.frequency),
    monetary: Number(row.monetary),
    rScore: row.r_score,
    fScore: row.f_score,
    mScore: row.m_score,
    segment: asSegment(row.rfm_segment),
  }));
}

const SENTIMENT_SUMMARY_DAYS = 90;

export async function getSentimentSummary(
  organizationId: string,
  branchId: string,
): Promise<SentimentSummary> {
  const supabase = createSupabaseServerClient();
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - SENTIMENT_SUMMARY_DAYS);
  from.setHours(0, 0, 0, 0);

  const { data, error } = await supabase.rpc("ai_sentiment_summary", {
    p_org_id: organizationId,
    p_branch_id: branchId,
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  });
  if (error || !data) return { positive: 0, neutral: 0, negative: 0 };

  const counts: SentimentSummary = { positive: 0, neutral: 0, negative: 0 };
  for (const row of data) {
    const label = row.sentiment_label as string | null;
    if (label === "positive") counts.positive = Number(row.feedback_count);
    else if (label === "neutral") counts.neutral = Number(row.feedback_count);
    else if (label === "negative") counts.negative = Number(row.feedback_count);
  }
  return counts;
}

export async function getRecentFeedback(
  organizationId: string,
  branchId: string,
): Promise<FeedbackListRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_feedback")
    .select("id, rating, feedback_text, sentiment_label, sentiment_score, created_at")
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error || !data) return [];
  return data.map((row) => ({
    id: row.id,
    rating: row.rating,
    feedbackText: row.feedback_text,
    sentimentLabel: row.sentiment_label,
    sentimentScore: row.sentiment_score == null ? null : Number(row.sentiment_score),
    createdAt: row.created_at,
  }));
}

function asClusterProfiles(value: unknown): ClusterProfileRow[] {
  const rows = Array.isArray(value) ? value : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const item = row as Partial<ClusterProfile>;
    if (typeof item.cluster_id !== "number") return [];
    return [{
      cluster_id: item.cluster_id,
      size: Number(item.size ?? 0),
      avg_recency: Number(item.avg_recency ?? 0),
      avg_frequency: Number(item.avg_frequency ?? 0),
      avg_monetary: Number(item.avg_monetary ?? 0),
      dinner_ratio: Number(item.dinner_ratio ?? 0),
      weekend_ratio: Number(item.weekend_ratio ?? 0),
      top_category: item.top_category ?? null,
      label: String(item.label ?? `Nhóm ${item.cluster_id}`),
    }];
  });
}

export async function getCustomerClusters(
  organizationId: string,
  branchId: string,
): Promise<CustomerClustersView> {
  const supabase = createSupabaseServerClient();
  const [{ data: fit }, { data: customers }] = await Promise.all([
    supabase
      .from("customer_clusters")
      .select("k, silhouette, profiles, fitted_at")
      .eq("organization_id", organizationId)
      .eq("branch_id", branchId)
      .order("fitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("customer_features")
      .select("customer_id, cluster_id, rfm_segment, recency_days, frequency, monetary")
      .eq("organization_id", organizationId)
      .eq("branch_id", branchId)
      .not("cluster_id", "is", null)
      .order("monetary", { ascending: false })
      .limit(100),
  ]);

  const mappedCustomers: ClusterCustomerRow[] = (customers ?? []).map((row) => ({
    customerId: row.customer_id,
    clusterId: row.cluster_id,
    rfmSegment: asSegment(row.rfm_segment),
    recencyDays: Number(row.recency_days),
    frequency: Number(row.frequency),
    monetary: Number(row.monetary),
  }));

  return {
    k: fit?.k ?? 0,
    silhouette: fit?.silhouette == null ? null : Number(fit.silhouette),
    fittedAt: fit?.fitted_at ?? null,
    profiles: asClusterProfiles(fit?.profiles),
    customers: mappedCustomers,
    reminder: RFM_VS_CLUSTER_REMINDER,
  };
}
