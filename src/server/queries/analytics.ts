import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { FeedbackListRow, RfmCustomerRow, RfmSegment, RfmSummaryRow } from "@/types/analytics";

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
