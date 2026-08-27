/**
 * Phát hiện bất thường robust — thay ngưỡng cố định 30% bằng baseline theo
 * thứ trong tuần + robust statistics (median/MAD + z-score).
 *
 * "Giảm 30%" ngày thứ Hai bình thường không giống "giảm 30%" ngày lễ hay
 * cuối tuần. Chỉ kết luận outlier khi z-score vượt ngưỡng, có tính tới
 * baseline cùng thứ của các tuần trước.
 */

export interface RevenueChangeAssessment {
  isOutlier: boolean;
  severity: "none" | "warning" | "critical";
  direction: "up" | "down" | "flat";
  zScore: number | null;
  /** Giải thích theo ngữ cảnh (thứ, mùa, số đơn) */
  explanation: string;
}

/** Robust z-score: 0.6745 × (x − median) / MAD */
export function madZScore(value: number, values: number[]): number | null {
  if (values.length < 3) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const deviations = sorted.map((v) => Math.abs(v - median));
  deviations.sort((a, b) => a - b);
  const mad = 1.4826 * deviations[Math.floor(deviations.length / 2)];
  if (mad === 0) return null; // mọi giá trị giống nhau — không có outlier
  return 0.6745 * (value - median) / mad;
}

/**
 * Baseline theo thứ trong tuần: lấy các điểm có cùng thứ (Mon-Sun) trong
 * các tuần trước, dùng median làm kỳ vọng. Cần ≥ 3 tuần để có baseline tin cậy.
 */
export function dayOfWeekBaseline(
  points: Array<{ periodStart: string; value: number }>,
  targetIndex: number,
  timezone: string,
): { expected: number; count: number } | null {
  const getDay = (iso: string) => {
    const date = new Date(iso);
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(date);
    const days: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 0 };
    return days[parts] ?? -1;
  };
  const sameDay = points.filter((p) => getDay(p.periodStart) === targetIndex);
  if (sameDay.length < 3) return null;
  const values = sameDay.map((p) => p.value).sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  return { expected: median, count: sameDay.length };
}

/**
 * Đánh giá thay đổi doanh thu giữa kỳ hiện tại và kỳ trước, có dùng
 * baseline theo thứ trong tuần khi đủ dữ liệu.
 */
export function assessRevenueChange(
  current: number,
  previous: number,
  context?: {
    /** Chuỗi thời gian để tính baseline cùng thứ */
    timeseries?: Array<{ periodStart: string; value: number }>;
    /** Index thứ trong tuần của kỳ hiện tại (0=CN..6=T7) */
    dayOfWeek?: number;
    timezone?: string;
    /** Số đơn kỳ trước — nếu quá ít, không kết luận mạnh */
    previousOrders?: number;
  },
): RevenueChangeAssessment {
  if (previous === 0) {
    return {
      isOutlier: false,
      severity: "none",
      direction: current > 0 ? "up" : "flat",
      zScore: null,
      explanation: "Kỳ trước không có doanh thu — không thể so sánh tỷ lệ.",
    };
  }

  const deltaPct = ((current - previous) / previous) * 100;
  const direction: RevenueChangeAssessment["direction"] = deltaPct > 1 ? "up" : deltaPct < -1 ? "down" : "flat";

  let zScore: number | null = null;
  let explanation = `Doanh thu ${direction === "up" ? "tăng" : direction === "down" ? "giảm" : "không đổi"} ${Math.abs(deltaPct).toFixed(0)}% so với kỳ trước.`;

  // Baseline theo thứ trong tuần (nếu đủ 3 tuần dữ liệu)
  if (context?.timeseries && context.dayOfWeek != null && context.timezone) {
    const baseline = dayOfWeekBaseline(context.timeseries, context.dayOfWeek, context.timezone);
    if (baseline) {
      const baselineChange = ((current - baseline.expected) / baseline.expected) * 100;
      zScore = madZScore(current, context.timeseries.map((p) => p.value));
      explanation += ` So với mức thường của thứ này (${baseline.expected.toLocaleString("vi-VN")}), mức ${Math.abs(baselineChange).toFixed(0)}% ${baselineChange > 0 ? "trên" : "dưới"} kỳ vọng.`;
    }
  }

  // Ngưỡng kết luận: ưu tiên z-score khi có baseline, còn không dùng magnitude
  let severity: RevenueChangeAssessment["severity"] = "none";
  if (zScore != null && Math.abs(zScore) >= 3) {
    severity = "critical";
    explanation += " Đây là điểm bất thường vượt ngưỡng thống kê (|z| ≥ 3).";
  } else if (zScore != null && Math.abs(zScore) >= 2) {
    severity = "warning";
    explanation += " Đây là điểm lệch đáng chú ý (|z| ≥ 2).";
  } else if (zScore == null) {
    // Không có baseline — fallback magnitude, nhưng có tính số đơn
    const orderAdjustment = (context?.previousOrders != null && context.previousOrders < 5) ? 0.5 : 1;
    const magnitude = Math.abs(deltaPct) * orderAdjustment;
    if (magnitude >= 60) severity = "critical";
    else if (magnitude >= 30) severity = "warning";
  }

  // Kỳ trước quá ít đơn → hạ mức cảnh báo (không đủ bằng chứng)
  if (context?.previousOrders != null && context.previousOrders < 5 && severity !== "none") {
    severity = severity === "critical" ? "warning" : "none";
    explanation += " Kỳ trước có rất ít đơn nên không đủ cơ sở kết luận bất thường.";
  }

  return { isOutlier: severity !== "none", severity, direction, zScore, explanation };
}

/** Mức tập trung theo số đơn: n ≤ 5 đơn → không kết luận concentration */
export function concentrationRatio(
  topValue: number,
  totalValue: number,
  totalOrders: number,
): { ratio: number; actionable: boolean } {
  if (totalValue <= 0 || totalOrders < 5) return { ratio: 0, actionable: false };
  return { ratio: topValue / totalValue, actionable: true };
}
