import { describe, expect, it } from "vitest";
import { aggregateToDailyPoints, backtestForecast, computeForecast } from "@/lib/ai/forecast";

function dailyPoints(count: number, base = 100, trend = 0): Array<{ date: string; revenue: number; orders: number }> {
  return Array.from({ length: count }, (_, i) => ({
    date: `2026-07-${String(1 + i).padStart(2, "0")}`,
    revenue: base + i * trend,
    orders: 5 + i,
  }));
}

describe("forecast backtest", () => {
  it("returns null with fewer than 21 days", () => {
    expect(backtestForecast(dailyPoints(20))).toBeNull();
  });

  it("produces wmape/mase/byHorizon for sufficient data", () => {
    const result = backtestForecast(dailyPoints(28, 100, 2));
    expect(result).not.toBeNull();
    expect(result!.trainDays).toBe(21);
    expect(result!.testDays).toBe(7);
    expect(result!.byHorizon).toHaveLength(7);
    expect(result!.wmape).not.toBeNull();
    expect(result!.wmape!).toBeGreaterThan(0);
    expect(result!.wmape!).toBeLessThan(1);
    expect(result!.mase).not.toBeNull();
  });

  it("has low WMAPE on a stable series", () => {
    const result = backtestForecast(dailyPoints(28, 100, 0));
    expect(result!.wmape!).toBeLessThan(0.2);
  });

  it("aggregates hourly rows into daily points", () => {
    const rows = [
      { period_start: "2026-07-01T08:00:00Z", net_revenue: 100, total_orders: 2 },
      { period_start: "2026-07-01T12:00:00Z", net_revenue: 200, total_orders: 3 },
      { period_start: "2026-07-02T09:00:00Z", net_revenue: 150, total_orders: 2 },
    ];
    const daily = aggregateToDailyPoints(rows);
    expect(daily).toHaveLength(2);
    expect(daily[0]?.revenue).toBe(300);
    expect(daily[0]?.orders).toBe(5);
  });

  it("computeForecast still works with backtest attached by caller", () => {
    const daily = dailyPoints(28);
    const forecast = computeForecast(daily, 30);
    expect(forecast.points).toHaveLength(30);
    expect(forecast.insufficient_data).toBe(false);
    const backtest = backtestForecast(daily);
    expect(backtest).not.toBeNull();
  });
});
