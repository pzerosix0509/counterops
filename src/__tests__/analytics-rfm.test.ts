import { describe, expect, it } from "vitest";
import {
  DEFAULT_RFM_RULES,
  applyRfmToFeatures,
  pickRfmRules,
  scoreRfm,
} from "@/lib/analytics/rfm";
import type { RfmSegmentRule } from "@/types/database";

describe("scoreRfm", () => {
  const asOf = new Date("2026-08-14T00:00:00Z");

  it("assigns quintile scores 1-5 and maps Champions", () => {
    const customers = Array.from({ length: 5 }, (_, i) => ({
      customerId: `c${i}`,
      recencyDays: 50 - i * 10,
      frequency: i + 1,
      monetary: (i + 1) * 100_000,
    }));
    const scored = scoreRfm(customers, asOf, DEFAULT_RFM_RULES);
    const champ = scored.find((row) => row.customerId === "c4");
    expect(champ?.rScore).toBe(5);
    expect(champ?.fScore).toBe(5);
    expect(champ?.mScore).toBe(5);
    expect(champ?.segment).toBe("Champions");
  });

  it("maps Lost when R and F are low relative to cohort", () => {
    const customers = [
      { customerId: "stale", recencyDays: 120, frequency: 1, monetary: 10_000 },
      { customerId: "c1", recencyDays: 90, frequency: 2, monetary: 50_000 },
      { customerId: "c2", recencyDays: 60, frequency: 3, monetary: 100_000 },
      { customerId: "c3", recencyDays: 30, frequency: 4, monetary: 200_000 },
      { customerId: "c4", recencyDays: 10, frequency: 5, monetary: 500_000 },
    ];
    const scored = scoreRfm(customers, asOf, DEFAULT_RFM_RULES);
    const lost = scored.find((row) => row.customerId === "stale");
    expect(lost?.rScore).toBe(1);
    expect(lost?.fScore).toBe(1);
    expect(lost?.segment).toBe("Lost");
  });
});

describe("applyRfmToFeatures", () => {
  const asOf = new Date("2026-08-14T00:00:00Z");

  it("loads org rules then scores", () => {
    const rules = [
      {
        segment: "Champions" as const,
        rMin: 4,
        rMax: 5,
        fMin: 4,
        fMax: 5,
        mMin: 4,
        mMax: 5,
        priority: 100,
      },
    ];
    const features = Array.from({ length: 5 }, (_, i) => ({
      customer_id: `c${i}`,
      recency_days: 50 - i * 10,
      frequency: i + 1,
      monetary: (i + 1) * 100_000,
    }));
    const scored = applyRfmToFeatures(features, rules, asOf);
    const champ = scored.find((row) => row.customer_id === "c4");
    expect(champ?.r_score).toBe(5);
    expect(champ?.f_score).toBe(5);
    expect(champ?.m_score).toBe(5);
    expect(champ?.rfm_segment).toBe("Champions");
  });
});

describe("pickRfmRules", () => {
  function rule(
    overrides: Partial<RfmSegmentRule> & Pick<RfmSegmentRule, "segment" | "organization_id">,
  ): RfmSegmentRule {
    return {
      id: overrides.id ?? "rule",
      branch_id: overrides.branch_id ?? null,
      r_min: overrides.r_min ?? 1,
      r_max: overrides.r_max ?? 5,
      f_min: overrides.f_min ?? 1,
      f_max: overrides.f_max ?? 5,
      m_min: overrides.m_min ?? 1,
      m_max: overrides.m_max ?? 5,
      priority: overrides.priority ?? 1,
      ...overrides,
    };
  }

  it("lets org-specific rules win over global rows", () => {
    const orgId = "org-1";
    const picked = pickRfmRules(
      [
        rule({
          id: "global",
          organization_id: null,
          segment: "Champions",
          r_min: 4,
          r_max: 5,
          f_min: 4,
          f_max: 5,
          m_min: 4,
          m_max: 5,
          priority: 5,
        }),
        rule({
          id: "org",
          organization_id: orgId,
          segment: "Champions",
          r_min: 5,
          r_max: 5,
          f_min: 5,
          f_max: 5,
          m_min: 5,
          m_max: 5,
          priority: 50,
        }),
      ],
      orgId,
    );
    expect(picked).toEqual([
      {
        segment: "Champions",
        rMin: 5,
        rMax: 5,
        fMin: 5,
        fMax: 5,
        mMin: 5,
        mMax: 5,
        priority: 50,
      },
    ]);
  });

  it("does not let sibling branch rules win over org-wide rules", () => {
    const orgId = "org-1";
    const picked = pickRfmRules(
      [
        rule({
          id: "org",
          organization_id: orgId,
          branch_id: null,
          segment: "Champions",
          r_min: 5,
          r_max: 5,
          f_min: 5,
          f_max: 5,
          m_min: 5,
          m_max: 5,
          priority: 10,
        }),
        rule({
          id: "sibling",
          organization_id: orgId,
          branch_id: "branch-sibling",
          segment: "Champions",
          r_min: 1,
          r_max: 1,
          f_min: 1,
          f_max: 1,
          m_min: 1,
          m_max: 1,
          priority: 99,
        }),
      ],
      orgId,
      "branch-current",
    );
    expect(picked).toEqual([
      {
        segment: "Champions",
        rMin: 5,
        rMax: 5,
        fMin: 5,
        fMax: 5,
        mMin: 5,
        mMax: 5,
        priority: 10,
      },
    ]);
  });
});
