import type {
  CustomerRfmInput,
  RfmRule,
  RfmScoredCustomer,
  RfmSegment,
} from "@/types/analytics";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreMetric(
  values: number[],
  value: number,
  higherIsBetter: boolean,
): number {
  const unique = [...new Set(values)].sort((a, b) => a - b);
  const m = unique.length;
  const idx = unique.indexOf(value);

  if (m < 5) {
    const rank = higherIsBetter ? idx + 1 : m - idx;
    return clamp(Math.round((rank / m) * 5), 1, 5);
  }

  const rank = higherIsBetter ? idx + 1 : m - idx;
  return clamp(Math.ceil((rank / m) * 5), 1, 5);
}

function matchesRule(
  rScore: number,
  fScore: number,
  mScore: number,
  rule: RfmRule,
): boolean {
  return (
    rScore >= rule.rMin &&
    rScore <= rule.rMax &&
    fScore >= rule.fMin &&
    fScore <= rule.fMax &&
    mScore >= rule.mMin &&
    mScore <= rule.mMax
  );
}

function assignSegment(
  rScore: number,
  fScore: number,
  mScore: number,
  rules: RfmRule[],
): RfmSegment {
  const sorted = [...rules].sort((a, b) => b.priority - a.priority);
  for (const rule of sorted) {
    if (matchesRule(rScore, fScore, mScore, rule)) {
      return rule.segment;
    }
  }
  return rScore <= 2 ? "Lost" : "Potential Loyalists";
}

export const DEFAULT_RFM_RULES: RfmRule[] = [
  {
    segment: "Champions",
    rMin: 4,
    rMax: 5,
    fMin: 4,
    fMax: 5,
    mMin: 4,
    mMax: 5,
    priority: 5,
  },
  {
    segment: "Loyal Customers",
    rMin: 3,
    rMax: 5,
    fMin: 4,
    fMax: 5,
    mMin: 3,
    mMax: 5,
    priority: 4,
  },
  {
    segment: "Potential Loyalists",
    rMin: 4,
    rMax: 5,
    fMin: 1,
    fMax: 3,
    mMin: 2,
    mMax: 5,
    priority: 3,
  },
  {
    segment: "At Risk",
    rMin: 1,
    rMax: 2,
    fMin: 3,
    fMax: 5,
    mMin: 3,
    mMax: 5,
    priority: 2,
  },
  {
    segment: "Lost",
    rMin: 1,
    rMax: 2,
    fMin: 1,
    fMax: 2,
    mMin: 1,
    mMax: 5,
    priority: 1,
  },
];

export interface RfmFeatureRow {
  customer_id: string;
  recency_days: number;
  frequency: number;
  monetary: number;
}

export interface RfmRuleRow {
  organization_id: string | null;
  branch_id: string | null;
  segment: string;
  r_min: number;
  r_max: number;
  f_min: number;
  f_max: number;
  m_min: number;
  m_max: number;
  priority: number;
}

function ruleSpecificity(
  row: RfmRuleRow,
  organizationId: string,
  branchId?: string | null,
): number {
  if (row.organization_id === organizationId && branchId && row.branch_id === branchId) {
    return 3;
  }
  if (row.organization_id === organizationId) return 2;
  if (row.organization_id == null) return 1;
  return 0;
}

export function pickRfmRules(
  rows: RfmRuleRow[],
  organizationId: string,
  branchId?: string | null,
): RfmRule[] {
  const bySegment = new Map<string, RfmRuleRow>();
  for (const row of rows) {
    const rank = ruleSpecificity(row, organizationId, branchId);
    if (rank === 0) continue;
    const existing = bySegment.get(row.segment);
    if (!existing || rank > ruleSpecificity(existing, organizationId, branchId)) {
      bySegment.set(row.segment, row);
    }
  }
  return [...bySegment.values()].map((row) => ({
    segment: row.segment as RfmSegment,
    rMin: row.r_min,
    rMax: row.r_max,
    fMin: row.f_min,
    fMax: row.f_max,
    mMin: row.m_min,
    mMax: row.m_max,
    priority: row.priority,
  }));
}

export function applyRfmToFeatures<T extends RfmFeatureRow>(
  features: T[],
  rules: RfmRule[],
  asOf: Date = new Date(),
): Array<T & { r_score: number; f_score: number; m_score: number; rfm_segment: RfmSegment }> {
  const scored = scoreRfm(
    features.map((feature) => ({
      customerId: feature.customer_id,
      recencyDays: Number(feature.recency_days),
      frequency: Number(feature.frequency),
      monetary: Number(feature.monetary),
    })),
    asOf,
    rules.length > 0 ? rules : DEFAULT_RFM_RULES,
  );
  const byCustomer = new Map(scored.map((row) => [row.customerId, row]));
  return features.map((feature) => {
    const row = byCustomer.get(feature.customer_id)!;
    return {
      ...feature,
      r_score: row.rScore,
      f_score: row.fScore,
      m_score: row.mScore,
      rfm_segment: row.segment,
    };
  });
}

export function scoreRfm(
  customers: CustomerRfmInput[],
  _asOf: Date,
  rules: RfmRule[],
): RfmScoredCustomer[] {
  if (customers.length === 0) return [];

  const recencyValues = customers.map((c) => c.recencyDays);
  const frequencyValues = customers.map((c) => c.frequency);
  const monetaryValues = customers.map((c) => c.monetary);

  return customers.map((customer) => {
    const rScore = scoreMetric(recencyValues, customer.recencyDays, false);
    const fScore = scoreMetric(frequencyValues, customer.frequency, true);
    const mScore = scoreMetric(monetaryValues, customer.monetary, true);
    const segment = assignSegment(rScore, fScore, mScore, rules);

    return {
      ...customer,
      rScore,
      fScore,
      mScore,
      segment,
    };
  });
}
