import { describe, expect, it } from "vitest";
import { assessRevenueChange, concentrationRatio, dayOfWeekBaseline, madZScore } from "@/lib/ai/anomaly";
import { decomposeRevenueDelta, decomposeByDimension } from "@/lib/ai/decomposition";

describe("anomaly robust statistics", () => {
  it("computes MAD z-score with outlier threshold", () => {
    const values = [100, 102, 98, 101, 99, 100, 500];
    const z = madZScore(500, values);
    expect(z).not.toBeNull();
    expect(z!).toBeGreaterThan(3);
    const normal = madZScore(101, values);
    expect(normal!).toBeLessThan(2);
  });

  it("returns null for insufficient data or zero MAD", () => {
    expect(madZScore(10, [1, 2])).toBeNull();
    expect(madZScore(10, [5, 5, 5, 5])).toBeNull();
  });

  it("builds day-of-week baseline from at least 3 same-day points", () => {
    const points = [
      { periodStart: "2026-07-06T00:00:00Z", value: 100 }, // Mon
      { periodStart: "2026-07-13T00:00:00Z", value: 120 }, // Mon
      { periodStart: "2026-07-20T00:00:00Z", value: 110 }, // Mon
      { periodStart: "2026-07-21T00:00:00Z", value: 500 }, // Tue — không cùng thứ
    ];
    const baseline = dayOfWeekBaseline(points, 1, "UTC"); // Monday
    expect(baseline).not.toBeNull();
    expect(baseline!.expected).toBe(110); // median 100,110,120
    expect(baseline!.count).toBe(3);
  });

  it("classifies revenue change using magnitude when no baseline", () => {
    const change = assessRevenueChange(40_000, 100_000, { previousOrders: 20 });
    expect(change.severity).toBe("critical"); // -60%
    const mild = assessRevenueChange(90_000, 100_000, { previousOrders: 20 });
    expect(mild.severity).toBe("none"); // -10%
  });

  it("downgrades severity when previous period had too few orders", () => {
    const change = assessRevenueChange(40_000, 100_000, { previousOrders: 3 });
    expect(change.severity).not.toBe("critical");
    expect(change.explanation).toContain("rất ít đơn");
  });

  it("requires ≥5 orders for concentration to be actionable", () => {
    expect(concentrationRatio(80_000, 100_000, 4).actionable).toBe(false);
    expect(concentrationRatio(80_000, 100_000, 10).actionable).toBe(true);
    expect(concentrationRatio(80_000, 100_000, 10).ratio).toBe(0.8);
  });
});

describe("driver decomposition", () => {
  it("decomposes revenue delta into orders effect and AOV effect", () => {
    // Trước: 100 đơn × 10.000 = 1.000.000
    // Sau:  80 đơn  × 12.000 = 960.000
    const result = decomposeRevenueDelta(
      { revenue: 960_000, orders: 80 },
      { revenue: 1_000_000, orders: 100 },
    );
    expect(result.delta).toBe(-40_000);
    // Δorders × AOV_prev = -20 × 10.000 = -200.000
    expect(result.ordersEffect).toBe(-200_000);
    // ΔAOV × orders_current = 2.000 × 80 = +160.000
    expect(result.aovEffect).toBe(160_000);
    // Tổng hai effect khớp delta
    expect(result.ordersEffect + result.aovEffect).toBe(result.delta);
  });

  it("reports the dominant driver share", () => {
    const result = decomposeRevenueDelta(
      { revenue: 960_000, orders: 80 },
      { revenue: 1_000_000, orders: 100 },
    );
    expect(result.ordersSharePct).not.toBeNull();
    expect(Math.abs(result.ordersSharePct!)).toBeGreaterThan(Math.abs(result.aovSharePct!));
  });

  it("decomposes by dimension with contributions", () => {
    const rows = decomposeByDimension(
      [{ name: "Grab", value: 300_000 }, { name: "Tại quán", value: 500_000 }],
      [{ name: "Grab", value: 600_000 }, { name: "Tại quán", value: 400_000 }],
      -200_000,
    );
    expect(rows).not.toBeNull();
    expect(rows![0].name).toBe("Grab"); // |delta| lớn nhất
    expect(rows![0].delta).toBe(-300_000);
    expect(rows![1].delta).toBe(100_000);
    // Tổng contribution = tổng delta
    expect(rows!.reduce((sum, row) => sum + row.contribution, 0)).toBe(-200_000);
  });

  it("returns null when either period has no rows", () => {
    expect(decomposeByDimension([{ name: "A", value: 1 }], [], 0)).toBeNull();
  });
});
