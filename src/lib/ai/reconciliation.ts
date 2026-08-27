/**
 * Đối soát số liệu — kiểm tra nhất quán giữa các nguồn trong một câu trả lời.
 *
 * Rules lấy từ METRIC_CATALOG (reconciliation rules), không hardcode:
 * - net_revenue/total_orders: summary phải khớp Σ timeseries trong tolerance
 * - breakdown (top_products/category/channel): Σ revenue không vượt summary
 *   (cho phép lệch nhỏ vì top_products loại item cancelled, summary loại order cancelled)
 * - kỳ so sánh phải có kỳ trước; kỳ hiện tại chưa hoàn tất → partial_period
 */

import type { AiAnalyticsContext, AiDataQualityIssue } from "@/types/ai";

export interface ReconciliationResult {
  issues: AiDataQualityIssue[];
  /** True nếu mọi check có dữ liệu đều pass */
  passed: boolean;
}

const SUMMARY_KEYS = ["net_revenue", "total_orders"] as const;

function tolerancePct(): number {
  return 0.005;
}

/** Kỳ hiện tại chưa hoàn tất: label tháng/tuần này và to = thời điểm hiện tại */
export function isPartialPeriod(range: AiAnalyticsContext["range"], now = new Date()): boolean {
  const label = range.label.toLocaleLowerCase("vi");
  const partialLabel = label.includes("tháng này") || label.includes("tuần này") || label.includes("hôm nay");
  if (!partialLabel) return false;
  const nowMs = now.getTime();
  const toMs = Date.parse(range.to);
  if (!Number.isFinite(toMs)) return false;
  // Kỳ hiện tại chưa hoàn tất nếu `to` sát hiện tại (trong 24h) — dữ liệu còn tiếp tục tăng
  return nowMs - toMs < 86_400_000 && nowMs >= toMs;
}

export function reconcileAnalytics(analytics: AiAnalyticsContext, now = new Date()): ReconciliationResult {
  const issues: AiDataQualityIssue[] = [];
  const summary = analytics.salesSummary;

  if (summary && analytics.salesTimeseries.length > 0) {
    const tol = tolerancePct();
    for (const key of SUMMARY_KEYS) {
      const total = analytics.salesTimeseries.reduce((sum, row) => sum + Number(row[key]), 0);
      const summaryValue = Number(summary[key]);
      const tolerance = Math.max(summaryValue * tol, key === "total_orders" ? 1 : 1_000);
      if (Math.abs(total - summaryValue) > tolerance) {
        issues.push({
          code: "summary_timeseries_mismatch",
          severity: "critical",
          message: `Tổng ${key === "net_revenue" ? "doanh thu" : "số đơn"} theo chuỗi thời gian (${total.toLocaleString("vi-VN")}) không khớp tổng hợp (${summaryValue.toLocaleString("vi-VN")}).`,
        });
      }
    }

    // Trùng ngày trong chuỗi thời gian → nghi ngờ dữ liệu bị nhân đôi
    const seen = new Set<string>();
    const duplicates = analytics.salesTimeseries.filter((row) => {
      const day = String(row.period_start).slice(0, 10);
      if (seen.has(day)) return true;
      seen.add(day);
      return false;
    });
    if (duplicates.length > 0) {
      issues.push({
        code: "duplicate_rows",
        severity: "warning",
        message: `Phát hiện ${duplicates.length} ngày bị trùng trong chuỗi thời gian (vd ${duplicates[0]?.period_start.slice(0, 10)}); số liệu có thể bị nhân đôi.`,
      });
    }
  }

  if (summary) {
    const tol = tolerancePct();
    // Mỗi breakdown là một phân bổ riêng của cùng tổng doanh thu:
    // top_products / category / channel đều ≤ summary, KHÔNG cộng dồn với nhau.
    const breakdowns: Array<{ name: string; revenue: number }> = [
      ...analytics.topProducts.map((row) => ({ name: row.product_name, revenue: row.revenue })),
      ...analytics.categorySummary.map((row) => ({ name: row.category_name, revenue: row.revenue })),
      ...analytics.channelSummary.map((row) => ({ name: row.channel_name, revenue: row.revenue })),
    ];
    const tolerance = Math.max(summary.net_revenue * tol, 1_000);
    for (const row of breakdowns) {
      if (row.revenue > summary.net_revenue + tolerance) {
        issues.push({
          code: "breakdown_exceeds_total",
          severity: "critical",
          message: `Doanh thu "${row.name}" (${row.revenue.toLocaleString("vi-VN")}) vượt doanh thu tổng hợp (${summary.net_revenue.toLocaleString("vi-VN")}).`,
        });
      }
    }
  }

  const comparison = analytics.periodComparison;
  if (comparison && comparison.current_orders > 0 && comparison.previous_orders === 0) {
    issues.push({
      code: "empty_previous_period",
      severity: "warning",
      message: "Kỳ trước liền kề không có đơn hàng; không thể so sánh chính xác.",
    });
  }

  if (isPartialPeriod(analytics.range, now)) {
    issues.push({
      code: "partial_period",
      severity: "info",
      message: "Kỳ hiện tại chưa hoàn tất — số liệu có thể tăng tiếp trong ngày.",
    });
  }

  return { issues, passed: issues.filter((i) => i.severity !== "info").length === 0 };
}
