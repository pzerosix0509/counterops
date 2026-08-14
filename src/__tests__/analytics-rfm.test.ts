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

  it("maps Lost when R is low", () => {
    const scored = scoreRfm(
      [{ customerId: "x", recencyDays: 120, frequency: 1, monetary: 10_000 }],
      asOf,
      DEFAULT_RFM_RULES,
    );
    expect(scored[0].segment).toBe("Lost");
  });
});
