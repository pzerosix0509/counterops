import { describe, expect, it } from "vitest";
import {
  detectOutliersMAD,
  growthRate,
  movingAverage,
  pearsonCorrelation,
  seasonalityIndex,
  twoSampleTTest,
} from "@/lib/ai/stats";
import { describeStatisticalFindings, runStatisticalAnalysis } from "@/lib/ai/analysis";
import type { AiAnalyticsContext } from "@/types/ai";

describe("statistical functions", () => {
  it("computes Pearson correlation correctly", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    expect(pearsonCorrelation(x, y)).toBeCloseTo(1, 5);
    expect(pearsonCorrelation(x, x.map((v) => -v))).toBeCloseTo(-1, 5);
    expect(pearsonCorrelation([1, 2], [1, 2])).toBeNull(); // < 3 điểm
  });

  it("flags significant t-test for clearly different samples", () => {
    const a = [100, 102, 101, 99, 100];
    const b = [150, 152, 149, 151, 148];
    const result = twoSampleTTest(a, b);
    expect(result).not.toBeNull();
    expect(result!.significant).toBe(true);
    expect(result!.pValue).toBeLessThan(0.05);
  });

  it("detects MAD outliers", () => {
    const values = [100, 102, 98, 101, 99, 100, 500, 101, 99];
    const outliers = detectOutliersMAD(values);
    expect(outliers.length).toBe(1);
    expect(outliers[0]?.value).toBe(500);
  });

  it("computes day-of-week seasonality index", () => {
    // 3 tuần, Chủ nhật (day 6 theo getUTCDay) luôn cao hơn
    const daily = [];
    for (let week = 0; week < 3; week += 1) {
      for (let day = 0; day < 7; day += 1) {
        daily.push({
          date: `2026-07-${String(6 + week * 7 + day).padStart(2, "0")}T00:00:00Z`,
          value: day === 6 ? 200 : 100,
        });
      }
    }
    const index = seasonalityIndex(daily);
    expect(index).not.toBeNull();
    expect(index!["CN"]).toBeGreaterThan(index!["T2"]!);
  });

  it("computes moving average and growth rate", () => {
    expect(movingAverage([1, 2, 3, 4], 3)).toEqual([1, 1.5, 2, 3]);
    const growth = growthRate([100, 110, 121]);
    expect(growth?.total).toBeCloseTo(0.21, 1);
    expect(growthRate([0, 5])).toBeNull();
  });
});

describe("statistical analysis integration", () => {
  function context(rows: Array<{ date: string; revenue: number; orders: number }>): AiAnalyticsContext {
    return {
      range: { from: "2026-07-01T00:00:00.000Z", to: "2026-07-07T23:59:59.999Z", label: "7 ngày qua" },
      salesSummary: null,
      topProducts: [],
      channelSummary: [],
      salesTimeseries: rows.map((row) => ({
        period_start: row.date,
        total_orders: row.orders,
        net_revenue: row.revenue,
        cost_of_goods: 0,
        gross_profit: row.revenue,
        channel_fees: 0,
        net_profit: row.revenue,
      })),
      categorySummary: [],
      periodComparison: null,
      forecastRevenue: null,
    };
  }

  it("returns null for non-diagnosis/trend intents", () => {
    const ctx = context([]);
    expect(runStatisticalAnalysis(ctx, "metric_lookup")).toBeNull();
  });

  it("returns null with too few points", () => {
    const ctx = context([
      { date: "2026-07-01T00:00:00Z", revenue: 100, orders: 5 },
      { date: "2026-07-02T00:00:00Z", revenue: 120, orders: 6 },
    ]);
    expect(runStatisticalAnalysis(ctx, "trend")).toBeNull();
  });

  it("finds strong correlation and significant trend for rising data", () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(1 + i).padStart(2, "0")}T00:00:00Z`,
      revenue: 100 + i * 10,
      orders: 5 + i,
    }));
    const findings = runStatisticalAnalysis(context(rows), "trend");
    expect(findings).not.toBeNull();
    expect(findings!.correlation).not.toBeUndefined();
    expect(Math.abs(findings!.correlation!.r)).toBeGreaterThan(0.9);
    expect(findings!.growth?.total).toBeGreaterThan(0);
  });

  it("describes findings in Vietnamese text", () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({
      date: `2026-07-${String(1 + i).padStart(2, "0")}T00:00:00Z`,
      revenue: 100 + i * 10,
      orders: 5 + i,
    }));
    const findings = runStatisticalAnalysis(context(rows), "trend")!;
    const lines = describeStatisticalFindings(findings);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((line) => line.includes("tương quan"))).toBe(true);
  });
});
