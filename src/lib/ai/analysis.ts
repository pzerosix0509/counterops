/**
 * Statistical analysis — chạy trên dữ liệu analytics khi intent diagnosis/trend.
 * KHÔNG kết luận nguyên nhân; chỉ nêu tương quan/outlier/seasonality/trend-test
 * để LLM diễn giải có dè dặt.
 */

import type { AiAnalyticsContext, AiIntent, AiStatisticalFindings } from "@/types/ai";
import {
  detectOutliersMAD,
  growthRate,
  pearsonCorrelation,
  seasonalityIndex,
  twoSampleTTest,
} from "@/lib/ai/stats";

const MIN_POINTS = 7;
const DAY_NAMES: Record<number, string> = { 0: "CN", 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7" };

export function runStatisticalAnalysis(
  analytics: AiAnalyticsContext,
  intent: AiIntent,
): AiStatisticalFindings | null {
  // Chỉ chạy cho diagnosis/trend và đủ dữ liệu chuỗi thời gian
  if (intent !== "diagnosis" && intent !== "trend") return null;
  if (analytics.salesTimeseries.length < MIN_POINTS) return null;

  const rows = [...analytics.salesTimeseries].sort((a, b) =>
    a.period_start.localeCompare(b.period_start),
  );
  const revenues = rows.map((row) => row.net_revenue);
  const orders = rows.map((row) => row.total_orders);

  const findings: AiStatisticalFindings = {};

  // 1. Tương quan doanh thu vs số đơn
  const r = pearsonCorrelation(revenues, orders);
  if (r != null) {
    const tTest = twoSampleTTest(revenues, orders);
    findings.correlation = {
      metric: "revenue_vs_orders",
      r: Math.round(r * 100) / 100,
      pValue: tTest?.pValue ?? 1,
      significant: tTest?.significant ?? false,
    };
  }

  // 2. Outlier MAD trên doanh thu daily
  const outliers = detectOutliersMAD(revenues);
  if (outliers.length > 0) {
    findings.outliers = outliers.map((outlier) => ({
      date: rows[outlier.index]?.period_start.slice(0, 10) ?? "",
      value: outlier.value,
      zScore: Math.round(outlier.zScore * 100) / 100,
      direction: outlier.value >= 0 ? "up" : "down",
    }));
  }

  // 3. Seasonality theo thứ trong tuần
  const seasonality = seasonalityIndex(
    rows.map((row) => ({ date: row.period_start, value: row.net_revenue })),
  );
  if (seasonality) {
    const entries = Object.entries(seasonality).sort((a, b) => b[1] - a[1]);
    findings.seasonality = {
      dayOfWeek: seasonality,
      strongestDay: entries[0]?.[0] ?? "",
      weakestDay: entries.at(-1)?.[0] ?? "",
    };
  }

  // 4. t-test nửa đầu vs nửa sau (xu hướng có ý nghĩa?)
  if (revenues.length >= 8) {
    const half = Math.floor(revenues.length / 2);
    const firstHalf = revenues.slice(0, half);
    const secondHalf = revenues.slice(half);
    const tTest = twoSampleTTest(firstHalf, secondHalf);
    if (tTest) {
      findings.tTest = {
        label: "Nửa đầu vs nửa sau chuỗi",
        t: Math.round(tTest.t * 100) / 100,
        pValue: Math.round(tTest.pValue * 1000) / 1000,
        significant: tTest.significant,
      };
    }
  }

  // 5. CAGR
  const growth = growthRate(revenues);
  if (growth) {
    findings.growth = {
      cagr: Math.round(growth.cagr * 10000) / 100,
      total: Math.round(growth.total * 10000) / 100,
    };
  }

  return Object.keys(findings).length > 0 ? findings : null;
}

/** Mô tả findings dạng text ngắn cho deterministic answer / prompt */
export function describeStatisticalFindings(findings: AiStatisticalFindings): string[] {
  const lines: string[] = [];
  if (findings.correlation) {
    const strength = Math.abs(findings.correlation.r) >= 0.7
      ? "mạnh"
      : Math.abs(findings.correlation.r) >= 0.4 ? "trung bình" : "yếu";
    lines.push(`Doanh thu và số đơn tương quan ${strength} (r=${findings.correlation.r}${findings.correlation.significant ? ", có ý nghĩa thống kê" : ", chưa đủ ý nghĩa"}).`);
  }
  if (findings.outliers && findings.outliers.length > 0) {
    const dates = findings.outliers.slice(0, 3).map((outlier) => outlier.date).join(", ");
    lines.push(`${findings.outliers.length} điểm bất thường (outlier) theo MAD: ${dates}.`);
  }
  if (findings.seasonality) {
    lines.push(`Mùa vụ theo thứ trong tuần: mạnh nhất ${findings.seasonality.strongestDay}, yếu nhất ${findings.seasonality.weakestDay}.`);
  }
  if (findings.tTest) {
    lines.push(`Xu hướng nửa đầu vs nửa sau: ${findings.tTest.significant ? "khác biệt có ý nghĩa" : "chưa đủ cơ sở khác biệt"} (p=${findings.tTest.pValue}).`);
  }
  if (findings.growth) {
    lines.push(`Tăng trưởng chuỗi: tổng ${findings.growth.total > 0 ? "+" : ""}${findings.growth.total}% (CAGR ${findings.growth.cagr}%).`);
  }
  return lines;
}

export { DAY_NAMES };
