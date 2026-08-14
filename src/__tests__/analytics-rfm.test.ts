import { describe, expect, it } from "vitest";
import { DEFAULT_RFM_RULES, scoreRfm } from "@/lib/analytics/rfm";

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
