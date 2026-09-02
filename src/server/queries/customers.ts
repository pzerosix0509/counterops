import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  asRfmSegmentValue,
  clusterIdsFromFeatures,
  filterAndSortCustomerRows,
  mergeCustomerRows,
  type CustomerFeatureJoin,
} from "@/lib/customers/list";
import { displayCustomerName } from "@/lib/customers/phone";
import type { Customer } from "@/types/database";
import type {
  CustomerDetail,
  CustomerIdentity,
  CustomerListFilters,
  CustomerListResult,
} from "@/types/customers";

function toIdentity(row: Customer): CustomerIdentity {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    email: row.email,
    birthday: row.birthday,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function mapFeature(row: {
  customer_id: string;
  recency_days: number;
  frequency: number;
  monetary: number;
  rfm_segment: string | null;
  cluster_id: number | null;
  avg_rating: number | null;
}): CustomerFeatureJoin {
  return {
    customerId: row.customer_id,
    recencyDays: Number(row.recency_days),
    frequency: Number(row.frequency),
    monetary: Number(row.monetary),
    rfmSegment: asRfmSegmentValue(row.rfm_segment),
    clusterId: row.cluster_id,
    avgRating: row.avg_rating == null ? null : Number(row.avg_rating),
  };
}

export async function listCustomersWithFeatures(
  organizationId: string,
  branchId: string,
  filters: CustomerListFilters,
): Promise<CustomerListResult> {
  const supabase = createSupabaseServerClient();
  let customerQuery = supabase
    .from("customers")
    .select("id, name, phone, email, birthday, notes, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1000);
  const term = filters.search?.replace(/[%_,]/g, "").trim();
  if (term) {
    customerQuery = customerQuery.or(`name.ilike.%${term}%,phone.ilike.%${term}%`);
  }

  const [{ data: customers, error: customerError }, { data: features, error: featureError }] = await Promise.all([
    customerQuery,
    supabase
      .from("customer_features")
      .select("customer_id, recency_days, frequency, monetary, rfm_segment, cluster_id, avg_rating")
      .eq("organization_id", organizationId)
      .eq("branch_id", branchId)
      .limit(2000),
  ]);
  if (customerError) throw new Error(customerError.message);
  if (featureError) throw new Error(featureError.message);

  const identities = (customers ?? []).map((row) => toIdentity(row as Customer));
  const featureRows = (features ?? []).map(mapFeature);
  const merged = mergeCustomerRows(identities, featureRows);
  const rows = filterAndSortCustomerRows(merged, { ...filters, search: term ? filters.search : undefined });
  return {
    rows,
    total: rows.length,
    clusterIds: clusterIdsFromFeatures(featureRows),
  };
}

export async function getCustomerDetail(
  customerId: string,
  organizationId: string,
  branchId: string,
): Promise<CustomerDetail | null> {
  const supabase = createSupabaseServerClient();
  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("*")
    .eq("id", customerId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (customerError) throw new Error(customerError.message);
  if (!customer) return null;

  const [{ data: feature }, { data: orders }, { data: feedback }] = await Promise.all([
    supabase
      .from("customer_features")
      .select(
        "recency_days, frequency, monetary, r_score, f_score, m_score, rfm_segment, cluster_id, avg_rating, sentiment_score, weekend_ratio, dinner_ratio, favorite_category, favorite_dish_id, computed_at",
      )
      .eq("organization_id", organizationId)
      .eq("branch_id", branchId)
      .eq("customer_id", customerId)
      .maybeSingle(),
    supabase
      .from("orders")
      .select("id, order_number, total_amount, opened_at, closed_at")
      .eq("organization_id", organizationId)
      .eq("branch_id", branchId)
      .eq("customer_id", customerId)
      .eq("status", "paid")
      .order("opened_at", { ascending: false })
      .limit(5),
    supabase
      .from("customer_feedback")
      .select("id, rating, feedback_text, sentiment_label, created_at")
      .eq("organization_id", organizationId)
      .eq("branch_id", branchId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  let favoriteDishName: string | null = null;
  if (feature?.favorite_dish_id) {
    const { data: product } = await supabase
      .from("products")
      .select("name")
      .eq("id", feature.favorite_dish_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    favoriteDishName = product?.name ?? null;
  }

  const identity = toIdentity(customer as Customer);
  return {
    ...identity,
    displayName: displayCustomerName(identity.name, identity.phone),
    features: feature
      ? {
          recencyDays: Number(feature.recency_days),
          frequency: Number(feature.frequency),
          monetary: Number(feature.monetary),
          rScore: feature.r_score,
          fScore: feature.f_score,
          mScore: feature.m_score,
          rfmSegment: asRfmSegmentValue(feature.rfm_segment),
          clusterId: feature.cluster_id,
          avgRating: feature.avg_rating == null ? null : Number(feature.avg_rating),
          sentimentScore: feature.sentiment_score == null ? null : Number(feature.sentiment_score),
          weekendRatio: Number(feature.weekend_ratio),
          dinnerRatio: Number(feature.dinner_ratio),
          favoriteCategory: feature.favorite_category,
          favoriteDishId: feature.favorite_dish_id,
          favoriteDishName,
          computedAt: feature.computed_at,
        }
      : null,
    recentOrders: (orders ?? []).map((row) => ({
      id: row.id,
      orderNumber: row.order_number,
      totalAmount: Number(row.total_amount),
      openedAt: row.opened_at,
      closedAt: row.closed_at,
    })),
    recentFeedback: (feedback ?? []).map((row) => ({
      id: row.id,
      rating: row.rating,
      feedbackText: row.feedback_text,
      sentimentLabel: row.sentiment_label,
      createdAt: row.created_at,
    })),
  };
}
