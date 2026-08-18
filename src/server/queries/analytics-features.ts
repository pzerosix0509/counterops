import "server-only";
import {
  DEFAULT_RFM_RULES,
  applyRfmToFeatures,
  pickRfmRules,
} from "@/lib/analytics/rfm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function refreshAndScoreCustomerFeatures(
  organizationId: string,
  branchId: string,
  asOf = new Date(),
): Promise<number> {
  const supabase = createSupabaseServerClient();
  const { data: updated, error: rpcError } = await supabase.rpc("refresh_customer_features", {
    p_org: organizationId,
    p_branch: branchId,
    p_as_of: asOf.toISOString(),
  });
  if (rpcError) throw new Error(rpcError.message);

  const [{ data: features, error: featureError }, { data: ruleRows, error: ruleError }] =
    await Promise.all([
      supabase
        .from("customer_features")
        .select("id, customer_id, recency_days, frequency, monetary")
        .eq("organization_id", organizationId)
        .eq("branch_id", branchId),
      supabase
        .from("rfm_segment_rules")
        .select(
          "organization_id, branch_id, segment, r_min, r_max, f_min, f_max, m_min, m_max, priority",
        )
        .or(`organization_id.eq.${organizationId},organization_id.is.null`),
    ]);
  if (featureError) throw new Error(featureError.message);
  if (ruleError) throw new Error(ruleError.message);

  const rules = pickRfmRules(ruleRows ?? [], organizationId, branchId);
  const scored = applyRfmToFeatures(
    features ?? [],
    rules.length > 0 ? rules : DEFAULT_RFM_RULES,
    asOf,
  );

  const writes = await Promise.all(
    scored.map((row) =>
      supabase
        .from("customer_features")
        .update({
          r_score: row.r_score,
          f_score: row.f_score,
          m_score: row.m_score,
          rfm_segment: row.rfm_segment,
        })
        .eq("id", row.id)
        .eq("organization_id", organizationId)
        .eq("branch_id", branchId),
    ),
  );
  const writeError = writes.find((result) => result.error)?.error;
  if (writeError) throw new Error(writeError.message);

  return typeof updated === "number" ? updated : scored.length;
}
