import { describe, expect, it } from "vitest";
import {
  aggregateToDailyPoints,
  computeDowSeasonality,
  computeForecast,
} from "@/lib/ai/forecast";
import { extractForecastHorizon } from "@/lib/ai/semantic-layer";

describe("forecast seasonality and timezone fixes", () => {
  it("correctly converts UTC midnight timestamp to local date in Asia/Ho_Chi_Minh without off-by-one bug", () => {
    // 2026-09-02T17:00:00.000Z corresponds to 2026-09-03 00:00:00 in UTC+7
    const rows = [
      { period_start: "2026-09-02T17:00:00.000Z", net_revenue: 1_200_000, total_orders: 10 },
      { period_start: "2026-09-01T17:00:00.000Z", net_revenue: 900_000, total_orders: 8 },
    ];
    const points = aggregateToDailyPoints(rows, "Asia/Ho_Chi_Minh");
    expect(points).toHaveLength(2);
    expect(points[0]?.date).toBe("2026-09-02");
    expect(points[1]?.date).toBe("2026-09-03");
  });

  it("fills missing zero-sales days between first and last date", () => {
    const rows = [
      { period_start: "2026-08-01T00:00:00Z", net_revenue: 100_000, total_orders: 2 },
      // 2026-08-02 is missing
      { period_start: "2026-08-03T00:00:00Z", net_revenue: 200_000, total_orders: 3 },
    ];
    const points = aggregateToDailyPoints(rows, "UTC");
    expect(points).toHaveLength(3);
    expect(points[0]?.date).toBe("2026-08-01");
    expect(points[1]?.date).toBe("2026-08-02");
    expect(points[1]?.revenue).toBe(0);
    expect(points[1]?.orders).toBe(0);
    expect(points[2]?.date).toBe("2026-08-03");
  });

  it("computes higher factors for weekend days when weekends have higher revenue", () => {
    // 14 days from Monday 2026-08-10 to Sunday 2026-08-23
    // Mon-Fri: 1,000,000; Sat-Sun: 2,000,000
    const points = Array.from({ length: 14 }, (_, i) => {
      const day = i + 10;
      const date = `2026-08-${String(day).padStart(2, "0")}`;
      const dow = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = Sun, 6 = Sat
      const isWeekend = dow === 0 || dow === 6;
      return {
        date,
        revenue: isWeekend ? 2_000_000 : 1_000_000,
        orders: isWeekend ? 20 : 10,
      };
    });

    const dowFactors = computeDowSeasonality(points);
    expect(dowFactors).toHaveLength(7);

    // DOW: 0 = Sun, 1 = Mon, ..., 6 = Sat
    const sunFactor = dowFactors[0]!;
    const satFactor = dowFactors[6]!;
    const monFactor = dowFactors[1]!;
    const wedFactor = dowFactors[3]!;

    expect(satFactor).toBeGreaterThan(1.2);
    expect(sunFactor).toBeGreaterThan(1.2);
    expect(monFactor).toBeLessThan(1.0);
    expect(wedFactor).toBeLessThan(1.0);
  });

  it("forecast points vary by day-of-week instead of remaining a flat line", () => {
    const points = Array.from({ length: 14 }, (_, i) => {
      const day = i + 10;
      const date = `2026-08-${String(day).padStart(2, "0")}`;
      const dow = new Date(`${date}T12:00:00Z`).getUTCDay();
      const isWeekend = dow === 0 || dow === 6;
      return {
        date,
        revenue: isWeekend ? 2_000_000 : 1_000_000,
        orders: isWeekend ? 20 : 10,
      };
    });

    const forecast = computeForecast(points, 14);
    expect(forecast.points).toHaveLength(14);

    const revenues = forecast.points.map((p) => p.forecasted_revenue);
    const uniqueRevenues = new Set(revenues);
    // Flat line would have size 1; seasonal forecast must have multiple distinct values
    expect(uniqueRevenues.size).toBeGreaterThan(1);

    // Verify that weekend forecasts are significantly higher than weekday forecasts
    for (const point of forecast.points) {
      const dow = new Date(`${point.period_start}T12:00:00Z`).getUTCDay();
      if (dow === 0 || dow === 6) {
        expect(point.forecasted_revenue).toBeGreaterThan(1_200_000);
      } else {
        expect(point.forecasted_revenue).toBeLessThan(1_200_000);
      }
    }
  });

  it("extracts horizon correctly from user query", () => {
    expect(extractForecastHorizon("dự đoán doanh thu 14 ngày tới")).toBe(14);
    expect(extractForecastHorizon("dự báo 7 ngày tới")).toBe(7);
    expect(extractForecastHorizon("dự báo 21 ngày")).toBe(21);
    expect(extractForecastHorizon("dự báo doanh thu tuần tới")).toBe(14);
    expect(extractForecastHorizon("dự đoán doanh thu tháng tới")).toBe(30);
    expect(extractForecastHorizon("dự đoán doanh thu")).toBe(30);
  });
});
