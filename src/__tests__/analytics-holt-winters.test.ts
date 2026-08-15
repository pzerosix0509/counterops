import { describe, expect, it } from "vitest";
import { holtWintersForecast } from "@/lib/analytics/holt-winters";

describe("holtWintersForecast", () => {
  it("forecasts a weekly repeating pattern", () => {
    const week = [10, 12, 11, 13, 30, 28, 9];
    const series = [...week, ...week, ...week, ...week];
    const out = holtWintersForecast(series, 7, 7);
    expect(out.points).toHaveLength(7);
    expect(out.points[4]).toBeGreaterThan(out.points[0]);
  });

  it("flags insufficient data under 14 days", () => {
    expect(holtWintersForecast([1, 2, 3], 7, 7).insufficientData).toBe(true);
  });
});
