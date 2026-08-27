"use server";

import { revalidatePath } from "next/cache";
import { DEMAND_DEFAULT_HORIZON } from "@/lib/analytics/demand";
import { buildClusterProfiles, chooseKAndFit, type KMeansFeatureRow } from "@/lib/analytics/kmeans";
import { canRefreshAnalytics, requireActiveContext, requireRole } from "@/lib/auth/permissions";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";
import { clearAiToolCache } from "@/server/ai/cache";
import { scoreUnscoredFeedback } from "@/server/actions/feedback";
import { computeAndPersistDemandForecasts } from "@/server/queries/analytics";
import { refreshAndScoreCustomerFeatures } from "@/server/queries/analytics-features";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const FEATURE_STALE_MS = 24 * 60 * 60 * 1000;

type FeatureFitRow = KMeansFeatureRow & {
  id: string;
  computed_at: string;
};

function featuresNeedRefresh(rows: { computed_at: string }[], now = new Date()) {
  if (rows.length === 0) return true;
  return rows.some((row) => now.getTime() - new Date(row.computed_at).getTime() > FEATURE_STALE_MS);
}

async function loadFitFeatures(organizationId: string, branchId: string): Promise<FeatureFitRow[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("customer_features")
    .select(
      "id, recency_days, frequency, monetary, avg_order_value, avg_order_interval, weekend_ratio, dinner_ratio, age, favorite_category, computed_at",
    )
    .eq("organization_id", organizationId)
    .eq("branch_id", branchId);
  if (error) throw new Error(error.message);
  return (data ?? []) as FeatureFitRow[];
}

export async function refreshCustomerAnalytics(): Promise<ActionResult<{ updated: number }>> {
  const ctx = await requireActiveContext();
  await requireRole(ctx.organizationId, canRefreshAnalytics);
  try {
    await scoreUnscoredFeedback();
    const updated = await refreshAndScoreCustomerFeatures(ctx.organizationId, ctx.branchId);
    clearAiToolCache();
    revalidatePath("/analytics");
    return actionOk({ updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return actionFail("INTERNAL_ERROR", "Không làm mới được RFM: " + message);
  }
}

export async function fitCustomerClusters(): Promise<ActionResult<{ k: number; updated: number }>> {
  const ctx = await requireActiveContext();
  await requireRole(ctx.organizationId, canRefreshAnalytics);
  try {
    let features = await loadFitFeatures(ctx.organizationId, ctx.branchId);
    if (featuresNeedRefresh(features)) {
      await refreshAndScoreCustomerFeatures(ctx.organizationId, ctx.branchId);
      features = await loadFitFeatures(ctx.organizationId, ctx.branchId);
    }

    const fit = chooseKAndFit(features);
    if (fit.insufficient_data) {
      return actionFail("INSUFFICIENT_DATA", "Cần ít nhất 6 khách có đặc trưng để phân cụm.");
    }

    const profiles = buildClusterProfiles(features, fit.labels);
    const supabase = createSupabaseServerClient();
    const writes = await Promise.all(
      features.map((row, index) =>
        supabase
          .from("customer_features")
          .update({ cluster_id: fit.labels[index] })
          .eq("id", row.id)
          .eq("organization_id", ctx.organizationId)
          .eq("branch_id", ctx.branchId),
      ),
    );
    const writeError = writes.find((result) => result.error)?.error;
    if (writeError) throw new Error(writeError.message);

    const { error: insertError } = await supabase.from("customer_clusters").insert({
      organization_id: ctx.organizationId,
      branch_id: ctx.branchId,
      k: fit.k,
      silhouette: fit.silhouette,
      feature_names: fit.featureNames,
      profiles,
      fitted_at: new Date().toISOString(),
    });
    if (insertError) throw new Error(insertError.message);

    clearAiToolCache();
    revalidatePath("/analytics");
    return actionOk({ k: fit.k, updated: features.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return actionFail("INTERNAL_ERROR", "Không phân cụm được khách: " + message);
  }
}

export async function refreshDemandForecasts(
  horizonDays = DEMAND_DEFAULT_HORIZON,
): Promise<ActionResult<{ dishes: number; ingredients: number }>> {
  const ctx = await requireActiveContext();
  await requireRole(ctx.organizationId, canRefreshAnalytics);
  try {
    const result = await computeAndPersistDemandForecasts(ctx.organizationId, ctx.branchId, horizonDays);
    clearAiToolCache();
    revalidatePath("/analytics");
    if (result.insufficientData) {
      return actionFail("INSUFFICIENT_DATA", "Cần ít nhất 14 ngày đơn đã thanh toán");
    }
    return actionOk({ dishes: result.dishes, ingredients: result.ingredients });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return actionFail("INTERNAL_ERROR", "Không dự báo được nhu cầu: " + message);
  }
}
