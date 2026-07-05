import type {
  AiAnalyticsContext,
  AiAnomaly,
  AiConfidence,
  AiDataQualityIssue,
  AiSource,
  AiToolExecution,
} from "@/types/ai";

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
  if (
    comparison
    && comparison.previous_orders >= 5
    && comparison.revenue_delta_percent != null
    && Math.abs(comparison.revenue_delta_percent) >= 30
  ) {
    anomalies.push({
      code: "revenue_change",
      severity: Math.abs(comparison.revenue_delta_percent) >= 60 ? "critical" : "warning",
      title: "Doanh thu biến động mạnh",
      description: `Doanh thu ${comparison.revenue_delta_percent > 0 ? "tăng" : "giảm"} ${Math.abs(comparison.revenue_delta_percent)}% so với kỳ trước.`,
    });
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

  let score = 0.95;
  for (const issue of qualityIssues) {
    score -= issue.severity === "critical" ? 0.3 : issue.severity === "warning" ? 0.12 : 0.04;
  }
  if (documentSources.length > 0) {
    const bestSimilarity = Math.max(
      ...documentSources.map((source) => Number(source.meta?.similarity ?? 0)),
    );
    if (bestSimilarity > 0 && bestSimilarity < 0.45) score -= 0.12;
  } else if (requestedDocumentSearch) {
    score -= 0.1;
  }
  const finalScore = roundScore(score);
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
    },
  };
}
