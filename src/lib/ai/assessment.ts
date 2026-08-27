import type {
  AiAnalyticsContext,
  AiAnomaly,
  AiConfidence,
  AiConfidenceComponents,
  AiDataQualityIssue,
  AiSource,
  AiToolExecution,
} from "@/types/ai";
import { reconcileAnalytics } from "@/lib/ai/reconciliation";
import { assessRevenueChange } from "@/lib/ai/anomaly";
import { detectOutliersMAD } from "@/lib/ai/stats";

export interface AiAssessment {
  confidence: AiConfidence;
  qualityIssues: AiDataQualityIssue[];
  anomalies: AiAnomaly[];
}

function roundScore(value: number) {
  return Math.round(Math.max(0, Math.min(1, value)) * 100) / 100;
}

function confidenceLevel(score: number): AiConfidence["level"] {
  if (score >= 0.85) return "high";
  if (score >= 0.55) return "medium";
  return "low";
}

export function assessAiEvidence(
  analytics: AiAnalyticsContext,
  executions: AiToolExecution[],
  sources: AiSource[],
): AiAssessment {
  const qualityIssues: AiDataQualityIssue[] = [];
  const anomalies: AiAnomaly[] = [];
  const requestedSales = executions.some((execution) => execution.call.name === "sales_summary");
  const summary = analytics.salesSummary;
  const sampleSize = summary?.total_orders ?? null;

  for (const execution of executions.filter((item) => item.error)) {
    qualityIssues.push({
      code: `tool_error_${execution.call.name}`,
      severity: "critical",
      message: `Không lấy được dữ liệu từ ${execution.call.name}: ${execution.error}`,
    });
  }

  if (requestedSales && !summary) {
    qualityIssues.push({
      code: "missing_sales_summary",
      severity: "critical",
      message: "Thiếu dữ liệu tổng hợp bán hàng cho kỳ đã chọn.",
    });
  } else if (summary?.total_orders === 0) {
    qualityIssues.push({
      code: "empty_period",
      severity: "warning",
      message: "Kỳ đã chọn chưa có đơn hàng đã thanh toán.",
    });
  } else if (summary && summary.total_orders < 5) {
    qualityIssues.push({
      code: "small_sample",
      severity: "warning",
      message: `Kỳ này chỉ có ${summary.total_orders} đơn; chưa đủ mẫu để kết luận xu hướng chắc chắn.`,
    });
  }

  if (summary && (
    summary.net_revenue < 0
    || summary.cost_of_goods < 0
    || summary.channel_fees < 0
  )) {
    qualityIssues.push({
      code: "invalid_negative_metric",
      severity: "critical",
      message: "Phát hiện chỉ số doanh thu, giá vốn hoặc phí có giá trị âm bất thường.",
    });
  }

  if (summary && analytics.topProducts.reduce((sum, row) => sum + row.revenue, 0) > summary.net_revenue + 1) {
    qualityIssues.push({
      code: "product_revenue_mismatch",
      severity: "critical",
      message: "Tổng doanh thu theo món lớn hơn doanh thu tổng hợp; dữ liệu cần được đối soát.",
    });
  }

  if (summary && summary.net_profit < 0) {
    anomalies.push({
      code: "negative_profit",
      severity: "critical",
      title: "Kinh doanh đang lỗ",
      description: `Lợi nhuận sau phí trong ${analytics.range.label.toLocaleLowerCase("vi")} đang âm.`,
    });
  }

  const comparison = analytics.periodComparison;
  if (comparison && comparison.previous_orders >= 5 && comparison.revenue_delta_percent != null) {
    const change = assessRevenueChange(
      comparison.current_revenue,
      comparison.previous_revenue,
      {
        previousOrders: comparison.previous_orders,
        timeseries: analytics.salesTimeseries.map((row) => ({
          periodStart: row.period_start,
          value: row.net_revenue,
        })),
        dayOfWeek: new Date(analytics.range.from).getUTCDay(),
        timezone: "Asia/Ho_Chi_Minh",
      },
    );
    if (change.severity !== "none") {
      anomalies.push({
        code: "revenue_change",
        severity: change.severity,
        title: "Doanh thu biến động mạnh",
        description: change.explanation,
      });
    }
  }

  // Outlier theo ngày trong chuỗi thời gian (MAD robust) — chạy độc lập với so sánh kỳ
  if (analytics.salesTimeseries.length >= 7) {
    const sorted = [...analytics.salesTimeseries].sort((a, b) =>
      a.period_start.localeCompare(b.period_start),
    );
    const values = sorted.map((row) => row.net_revenue);
    const outliers = detectOutliersMAD(values);
    for (const outlier of outliers) {
      const day = sorted[outlier.index];
      if (!day) continue;
      anomalies.push({
        code: "timeseries_outlier",
        severity: Math.abs(outlier.zScore) >= 3 ? "warning" : "info",
        title: "Doanh thu ngày bất thường",
        description: `${day.period_start.slice(0, 10)} có doanh thu ${day.net_revenue.toLocaleString("vi-VN")} lệch ${outlier.zScore.toFixed(1)} độ lệch chuẩn MAD so với chuỗi (${outlier.value >= 0 ? "cao" : "thấp"} hơn bình thường).`,
      });
    }
  }

  if (summary && summary.net_revenue > 0 && summary.total_orders >= 5) {
    const leadingProduct = analytics.topProducts[0];
    if (leadingProduct && leadingProduct.revenue / summary.net_revenue >= 0.6) {
      anomalies.push({
        code: "product_concentration",
        severity: "warning",
        title: "Doanh thu phụ thuộc vào một món",
        description: `${leadingProduct.product_name} đóng góp ${Math.round((leadingProduct.revenue / summary.net_revenue) * 100)}% doanh thu.`,
      });
    }
    const leadingChannel = analytics.channelSummary[0];
    if (leadingChannel && leadingChannel.revenue / summary.net_revenue >= 0.8) {
      anomalies.push({
        code: "channel_concentration",
        severity: "warning",
        title: "Doanh thu tập trung vào một kênh",
        description: `${leadingChannel.channel_name} đóng góp ${Math.round((leadingChannel.revenue / summary.net_revenue) * 100)}% doanh thu.`,
      });
    }
  }

  const inventoryRows = executions
    .find((execution) => execution.call.name === "inventory_risk" && !execution.error)
    ?.rows ?? [];
  const negativeInventory = inventoryRows.filter((row) => Number(row.quantity_on_hand) < 0).length;
  if (negativeInventory > 0) {
    anomalies.push({
      code: "negative_inventory",
      severity: "critical",
      title: "Có hàng hóa âm kho",
      description: `${negativeInventory} mặt hàng đang có tồn kho âm.`,
    });
  }

  // Đối soát số liệu: summary vs timeseries, breakdown ≤ tổng, kỳ so sánh, partial period
  const reconciliation = reconcileAnalytics(analytics);
  qualityIssues.push(...reconciliation.issues);

  const documentSources = sources.filter((source) => source.type === "document");
  const requestedDocumentSearch = executions.some((execution) => execution.call.name === "search_documents");
  if (
    requestedDocumentSearch
    && documentSources.length === 0
  ) {
    qualityIssues.push({
      code: "no_relevant_document",
      severity: "critical",
      message: "Không tìm thấy đoạn tài liệu đủ liên quan với câu hỏi.",
    });
  }

  // Confidence đa chiều: 4 component riêng, score là tổng có trọng số.
  // Giữ score đồng nhất với hành vi cũ (refinement threshold < 0.6, prompt).
  const components = computeConfidenceComponents(
    analytics,
    executions,
    qualityIssues,
    documentSources,
    requestedDocumentSearch,
    anomalies,
  );

  const WEIGHTS = { query: 0.3, dataCompleteness: 0.25, consistency: 0.25, analysisFit: 0.2 };
  const weighted = (
    components.query * WEIGHTS.query
    + components.dataCompleteness * WEIGHTS.dataCompleteness
    + components.consistency * WEIGHTS.consistency
    + components.analysisFit * WEIGHTS.analysisFit
  );
  const finalScore = roundScore(weighted);
  const reasons = qualityIssues.map((issue) => issue.message);
  if (reasons.length === 0) reasons.push("Các nguồn dữ liệu cần thiết đã được truy vấn thành công.");

  return {
    qualityIssues,
    anomalies,
    confidence: {
      score: finalScore,
      level: confidenceLevel(finalScore),
      reasons,
      sampleSize,
      components,
    },
  };
}

function computeConfidenceComponents(
  analytics: AiAnalyticsContext,
  executions: AiToolExecution[],
  qualityIssues: AiDataQualityIssue[],
  documentSources: AiSource[],
  requestedDocumentSearch: boolean,
  anomalies: AiAnomaly[],
): AiConfidenceComponents {
  const summary = analytics.salesSummary;

  // 1. Độ đúng query
  let query = 1;
  const toolErrors = executions.filter((item) => item.error);
  query -= toolErrors.length * 0.15;
  const criticalIssues = qualityIssues.filter((issue) => issue.severity === "critical").length;
  query -= criticalIssues * 0.08;
  if (requestedDocumentSearch && documentSources.length === 0) query -= 0.1;
  query = roundScore(query);

  // 2. Độ đầy đủ dữ liệu
  let dataCompleteness = 1;
  if (!summary) {
    dataCompleteness -= 0.1;
  } else if (summary.total_orders === 0) {
    dataCompleteness -= 0.25;
  } else if (summary.total_orders < 5) {
    // 1-4 đơn là mẫu quá nhỏ để kết luận chắc chắn
    dataCompleteness -= 0.35;
  }
  if (qualityIssues.some((issue) => issue.code === "partial_period")) dataCompleteness -= 0.05;
  dataCompleteness = roundScore(dataCompleteness);

  // 3. Độ nhất quán số liệu (reconciliation)
  let consistency = 1;
  const mismatch = qualityIssues.some((issue) => issue.code === "summary_timeseries_mismatch" || issue.code === "breakdown_exceeds_total");
  if (mismatch) consistency -= 0.3;
  if (qualityIssues.some((issue) => issue.code === "empty_previous_period")) consistency -= 0.12;
  consistency = roundScore(consistency);

  // 4. Độ phù hợp phân tích
  let analysisFit = 1;
  const revenueAnomaly = anomalies.find((anomaly) => anomaly.code === "revenue_change");
  if (revenueAnomaly?.severity === "critical") analysisFit -= 0.4;
  else if (revenueAnomaly?.severity === "warning") analysisFit -= 0.2;
  if (anomalies.some((anomaly) => anomaly.code === "negative_profit")) analysisFit -= 0.15;
  analysisFit = roundScore(analysisFit);

  // 5. Độ tin cậy dự báo (chỉ khi có forecast)
  const forecast = analytics.forecastRevenue;
  let forecastReliability: number | null = null;
  if (forecast) {
    if (forecast.insufficient_data) {
      forecastReliability = 0.2;
    } else if (forecast.horizon_days > 30) {
      forecastReliability = 0.6;
    } else {
      forecastReliability = 0.8;
    }
  }

  return { query, dataCompleteness, consistency, analysisFit, forecastReliability };
}
