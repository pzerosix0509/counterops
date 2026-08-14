import { describe, expect, it } from "vitest";
import {
  chooseKAndFit,
  silhouetteForClustering,
  standardize,
} from "@/lib/analytics/kmeans";

describe("chooseKAndFit", () => {
  it("separates two obvious blobs", () => {
    const rows = [
      ...Array.from({ length: 20 }, () => ({
        recency_days: 5,
        frequency: 20,
        monetary: 2_000_000,
        avg_order_value: 100_000,
        avg_order_interval: 7,
        weekend_ratio: 0.2,
        dinner_ratio: 0.8,
        age: 30,
      })),
      ...Array.from({ length: 20 }, () => ({
        recency_days: 80,
        frequency: 2,
        monetary: 80_000,
        avg_order_value: 40_000,
        avg_order_interval: 40,
        weekend_ratio: 0.6,
        dinner_ratio: 0.1,
        age: 45,
      })),
    ];
    const result = chooseKAndFit(rows, 2, 4);
    expect(result.k).toBeGreaterThanOrEqual(2);
    expect(new Set(result.labels).size).toBe(result.k);
    expect(result.silhouette).toBeGreaterThan(0.3);
  });

  it("returns insufficient_data when n < 6", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      recency_days: i + 1,
      frequency: i + 1,
      monetary: (i + 1) * 10_000,
      avg_order_value: 50_000,
      avg_order_interval: 10,
      weekend_ratio: 0.5,
      dinner_ratio: 0.5,
      age: 30,
    }));
    const result = chooseKAndFit(rows);
    expect(result.insufficient_data).toBe(true);
    expect(result.labels).toEqual([]);
  });
});

describe("silhouetteForClustering", () => {
  it("counts singletons as zero and allows negative scores", () => {
    const data = [
      [0, 0],
      [1, 0],
      [2, 0],
    ];
    const labels = [0, 1, 0];
    // singleton at index 1 => 0; indices 0 and 2 => (1-2)/2 = -0.5 each
    expect(silhouetteForClustering(data, labels)).toBeCloseTo(-1 / 3, 5);
  });

  it("averages singleton zeros into the mean", () => {
    const data = [
      [0, 0],
      [0, 0],
      [10, 0],
    ];
    const labels = [0, 0, 1];
    // two identical cluster-0 points (s=1 each) plus one singleton (0)
    expect(silhouetteForClustering(data, labels)).toBeCloseTo(2 / 3, 5);
  });
});

describe("standardize", () => {
  it("z-scores each column", () => {
    const matrix = [
      [1, 10],
      [2, 20],
      [3, 30],
    ];
    const scaled = standardize(matrix);
    expect(scaled[0][0]).toBeCloseTo(-1, 5);
    expect(scaled[2][0]).toBeCloseTo(1, 5);
    expect(scaled[1][1]).toBeCloseTo(0, 5);
  });
});
