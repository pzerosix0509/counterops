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
