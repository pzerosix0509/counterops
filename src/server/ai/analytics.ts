import "server-only";
import { formatVND } from "@/lib/date/ranges";
import type {
  AiAnalyticsContext,
  AiChartSpec,
  AiDashboardSpec,
  AiPlan,
  AiSource,
  AiToolExecution,
} from "@/types/ai";
import type { AiAssessment } from "@/lib/ai/assessment";

function rowsFor(executions: AiToolExecution[], name: AiToolExecution["call"]["name"]) {
  return executions.find((execution) => execution.call.name === name && !execution.error)?.rows ?? [];
}

function numberValue(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildAnalyticsContext(executions: AiToolExecution[]): AiAnalyticsContext {
  const rangeCall = executions.find((execution) => typeof execution.call.arguments.from === "string");
  const range = {
    from: String(rangeCall?.call.arguments.from ?? new Date().toISOString()),
    to: String(rangeCall?.call.arguments.to ?? new Date().toISOString()),
    label: String(rangeCall?.call.arguments.rangeLabel ?? "Kỳ đã chọn"),
  };
  const salesSummary = rowsFor(executions, "sales_summary")[0] as any;
  const comparison = rowsFor(executions, "period_comparison")[0] as any;

  return {
    range,
    salesSummary: salesSummary ? {
      total_orders: numberValue(salesSummary.total_orders),
      net_revenue: numberValue(salesSummary.net_revenue),
      cost_of_goods: numberValue(salesSummary.cost_of_goods),
      gross_profit: numberValue(salesSummary.gross_profit),
      channel_fees: numberValue(salesSummary.channel_fees),
      net_profit: numberValue(salesSummary.net_profit),
    } : null,
    topProducts: rowsFor(executions, "top_products").map((row: any) => ({
      product_name: String(row.product_name ?? ""),
      quantity: numberValue(row.quantity),
      revenue: numberValue(row.revenue),
      cost_of_goods: numberValue(row.cost_of_goods),
      gross_profit: numberValue(row.gross_profit),
    })),
    channelSummary: rowsFor(executions, "channel_summary").map((row: any) => ({
      channel_name: String(row.channel_name ?? ""),
      orders: numberValue(row.orders),
      revenue: numberValue(row.revenue),
      channel_fees: numberValue(row.channel_fees),
    })),
    salesTimeseries: rowsFor(executions, "sales_timeseries").map((row: any) => ({
      period_start: String(row.period_start ?? ""),
      total_orders: numberValue(row.total_orders),
      net_revenue: numberValue(row.net_revenue),
      cost_of_goods: numberValue(row.cost_of_goods),
      gross_profit: numberValue(row.gross_profit),
      channel_fees: numberValue(row.channel_fees),
      net_profit: numberValue(row.net_profit),
    })),
    categorySummary: rowsFor(executions, "category_summary").map((row: any) => ({
      category_id: row.category_id ? String(row.category_id) : null,
      category_name: String(row.category_name ?? "Không phân loại"),
      quantity: numberValue(row.quantity),
      revenue: numberValue(row.revenue),
      cost_of_goods: numberValue(row.cost_of_goods),
      gross_profit: numberValue(row.gross_profit),
    })),
    periodComparison: comparison ? {
      current_orders: numberValue(comparison.current_orders),
      previous_orders: numberValue(comparison.previous_orders),
      orders_delta_percent: comparison.orders_delta_percent == null ? null : numberValue(comparison.orders_delta_percent),
      current_revenue: numberValue(comparison.current_revenue),
      previous_revenue: numberValue(comparison.previous_revenue),
      revenue_delta_percent: comparison.revenue_delta_percent == null ? null : numberValue(comparison.revenue_delta_percent),
      current_profit: numberValue(comparison.current_profit),
      previous_profit: numberValue(comparison.previous_profit),
      profit_delta_percent: comparison.profit_delta_percent == null ? null : numberValue(comparison.profit_delta_percent),
    } : null,
  };
}

function deltaDirection(value: number | null | undefined) {
  if (value == null || value === 0) return "flat" as const;
  return value > 0 ? "up" as const : "down" as const;
}

function deltaText(value: number | null | undefined) {
  return value == null ? "Chưa có kỳ đối chiếu" : `${value > 0 ? "+" : ""}${value}%`;
}

export function buildDashboardSpec(analytics: AiAnalyticsContext): AiDashboardSpec {
  const summary = analytics.salesSummary;
  const comparison = analytics.periodComparison;
  const revenue = numberValue(summary?.net_revenue);
  const cost = numberValue(summary?.cost_of_goods);
  const grossProfit = numberValue(summary?.gross_profit);
  const netProfit = numberValue(summary?.net_profit);
  const margin = revenue > 0 ? Math.round((netProfit / revenue) * 1000) / 10 : 0;

  const productRows = analytics.topProducts.slice(0, 10).map((row) => ({
    product: row.product_name,
    quantity: numberValue(row.quantity),
    revenue: numberValue(row.revenue),
    cost: numberValue(row.cost_of_goods),
    profit: numberValue(row.gross_profit),
    margin: row.revenue > 0 ? Math.round((row.gross_profit / row.revenue) * 1000) / 10 : 0,
  }));
  const lowProfitRows = [...productRows]
    .sort((left, right) => left.margin - right.margin || left.profit - right.profit)
    .slice(0, 6);

  const charts: AiChartSpec[] = [];
  if (analytics.salesTimeseries.length > 0) {
    charts.push({
      type: "composed",
      title: "Doanh thu, giá vốn và lợi nhuận theo thời gian",
      xKey: "period",
      yKey: "revenue",
      data: analytics.salesTimeseries.map((row) => ({
        period: row.period_start,
        revenue: row.net_revenue,
        cost: row.cost_of_goods,
        profit: row.net_profit,
      })),
    });
  }
  if (analytics.categorySummary.length > 0) {
    charts.push({
      type: "donut",
      title: "Doanh thu theo nhóm món",
      xKey: "category",
      yKey: "revenue",
      data: analytics.categorySummary.map((row) => ({
        category: row.category_name,
        revenue: row.revenue,
      })),
    });
  }
  if (productRows.length > 0) {
    charts.push({
      type: "composed",
      title: "Top món theo doanh thu và lợi nhuận",
      xKey: "product",
      yKey: "revenue",
      data: productRows.map((row) => ({
        product: row.product,
        revenue: row.revenue,
        profit: row.profit,
      })),
    });
  }
  if (analytics.channelSummary.length > 0) {
    charts.push({
      type: "donut",
      title: "Doanh thu theo kênh bán",
      xKey: "channel",
      yKey: "revenue",
      data: analytics.channelSummary.map((row) => ({
        channel: row.channel_name,
        revenue: row.revenue,
      })),
    });
  }

  return {
    title: `Dashboard quản trị - ${analytics.range.label}`,
    description: "KPI và phân tích được dựng từ các analytics tool có kiểm soát.",
    layout: "grid",
    filters: [
      `Thời gian: ${analytics.range.label}`,
      "Chi nhánh hiện tại",
      "Chỉ gồm đơn đã thanh toán",
    ],
    cards: [
      {
        title: "Doanh thu thuần",
        value: formatVND(revenue),
        tone: "neutral",
        delta: {
          label: "So với kỳ trước",
          value: deltaText(comparison?.revenue_delta_percent),
          direction: deltaDirection(comparison?.revenue_delta_percent),
        },
      },
      { title: "Giá vốn", value: formatVND(cost), tone: "warning" },
      { title: "Lợi nhuận gộp", value: formatVND(grossProfit), tone: grossProfit >= 0 ? "good" : "bad" },
      {
        title: "Lợi nhuận sau phí",
        value: formatVND(netProfit),
        description: `Biên lợi nhuận ${margin}%`,
        tone: netProfit >= 0 ? "good" : "bad",
        delta: {
          label: "So với kỳ trước",
          value: deltaText(comparison?.profit_delta_percent),
          direction: deltaDirection(comparison?.profit_delta_percent),
        },
      },
      {
        title: "Số đơn",
        value: numberValue(summary?.total_orders),
        tone: "neutral",
        delta: {
          label: "So với kỳ trước",
          value: deltaText(comparison?.orders_delta_percent),
          direction: deltaDirection(comparison?.orders_delta_percent),
        },
      },
      { title: "Phí kênh", value: formatVND(numberValue(summary?.channel_fees)), tone: "warning" },
    ],
    charts,
    tables: [
      {
        title: "Top món chi tiết",
        columns: [
          { key: "product", label: "Món" },
          { key: "quantity", label: "SL", align: "right" },
          { key: "revenue", label: "Doanh thu", align: "right" },
          { key: "profit", label: "Lãi", align: "right" },
          { key: "margin", label: "Biên %", align: "right" },
        ],
        rows: productRows,
      },
      {
        title: "Món có biên lợi nhuận thấp",
        columns: [
          { key: "product", label: "Món" },
          { key: "revenue", label: "Doanh thu", align: "right" },
          { key: "cost", label: "Giá vốn", align: "right" },
          { key: "profit", label: "Lãi", align: "right" },
          { key: "margin", label: "Biên %", align: "right" },
        ],
        rows: lowProfitRows,
      },
    ],
    insights: [
      analytics.topProducts[0]
        ? `Món đóng góp doanh thu cao nhất là ${analytics.topProducts[0].product_name}, đạt ${formatVND(analytics.topProducts[0].revenue)}.`
        : "Chưa có dữ liệu món bán trong kỳ.",
      lowProfitRows[0]
        ? `${lowProfitRows[0].product} có biên lợi nhuận thấp nhất trong nhóm top món (${lowProfitRows[0].margin}%).`
        : "Chưa đủ dữ liệu để nhận diện món có biên lợi nhuận thấp.",
      analytics.channelSummary[0]
        ? `Kênh bán đóng góp doanh thu cao nhất là ${analytics.channelSummary[0].channel_name}.`
        : "Chưa có dữ liệu kênh bán trong kỳ.",
      comparison?.revenue_delta_percent == null
        ? "Kỳ trước chưa có doanh thu để tính tỷ lệ thay đổi."
        : `Doanh thu ${comparison.revenue_delta_percent >= 0 ? "tăng" : "giảm"} ${Math.abs(comparison.revenue_delta_percent)}% so với kỳ trước.`,
    ],
  };
}

export function buildChartForQuestion(question: string, analytics: AiAnalyticsContext): AiChartSpec | null {
  const q = question.toLocaleLowerCase("vi");
  if ((q.includes("theo ngày") || q.includes("xu hướng") || q.includes("biểu đồ")) && analytics.salesTimeseries.length > 0) {
    return {
      type: "composed",
      title: `Doanh thu và lợi nhuận - ${analytics.range.label}`,
      xKey: "period",
      yKey: "revenue",
      data: analytics.salesTimeseries.map((row) => ({
        period: row.period_start,
        revenue: row.net_revenue,
        cost: row.cost_of_goods,
        profit: row.net_profit,
      })),
    };
  }
  if ((q.includes("nhóm") || q.includes("danh mục")) && analytics.categorySummary.length > 0) {
    return {
      type: "donut",
      title: `Doanh thu theo nhóm món - ${analytics.range.label}`,
      xKey: "category",
      yKey: "revenue",
      data: analytics.categorySummary.map((row) => ({
        category: row.category_name,
        revenue: row.revenue,
      })),
    };
  }
  if ((q.includes("kênh") || q.includes("channel")) && analytics.channelSummary.length > 0) {
    return {
      type: "bar",
      title: `Doanh thu theo kênh bán - ${analytics.range.label}`,
      xKey: "channel",
      yKey: "revenue",
      data: analytics.channelSummary.map((row) => ({
        channel: row.channel_name,
        revenue: row.revenue,
        fees: row.channel_fees,
      })),
    };
  }
  if ((q.includes("món") || q.includes("top")) && analytics.topProducts.length > 0) {
    return {
      type: "composed",
      title: `Top món - ${analytics.range.label}`,
      xKey: "product",
      yKey: "revenue",
      data: analytics.topProducts.slice(0, 8).map((row) => ({
        product: row.product_name,
        revenue: row.revenue,
        profit: row.gross_profit,
      })),
    };
  }
  return null;
}

function sourceIdFor(sources: AiSource[], tool: string) {
  return sources.find((source) => source.meta?.tool === tool)?.id;
}

export function buildDeterministicAnswer(
  plan: AiPlan,
  analytics: AiAnalyticsContext,
  executions: AiToolExecution[],
  sources: AiSource[],
  assessment: AiAssessment,
) {
  const summary = analytics.salesSummary;
  const citation = (tool: string) => {
    const id = sourceIdFor(sources, tool);
    return id ? ` [${id}]` : "";
  };
  let bullets: string[] = [];

  switch (plan.intent) {
    case "greeting":
      bullets = [
        "Mình có thể tra cứu doanh thu, lợi nhuận, món bán chạy, kênh bán và tồn kho.",
        "Bạn cũng có thể yêu cầu so sánh kỳ, tìm trong tài liệu hoặc tạo dashboard.",
      ];
      break;
    case "metric_lookup":
      bullets = summary
        ? [
          `Doanh thu thuần: ${formatVND(summary.net_revenue)}${citation("sales_summary")}.`,
          `Lợi nhuận sau phí: ${formatVND(summary.net_profit)}${citation("sales_summary")}.`,
          `Số đơn đã thanh toán: ${summary.total_orders}${citation("sales_summary")}.`,
        ]
        : [`Chưa có dữ liệu bán hàng trong ${analytics.range.label.toLocaleLowerCase("vi")}.`];
      break;
    case "trend": {
      const rows = analytics.salesTimeseries;
      bullets = summary
        ? [
          `${analytics.range.label}: doanh thu ${formatVND(summary.net_revenue)}, lợi nhuận sau phí ${formatVND(summary.net_profit)}${citation("sales_summary")}.`,
          `Chuỗi thời gian có ${rows.length} mốc dữ liệu${citation("sales_timeseries")}.`,
        ]
        : ["Chưa có dữ liệu để dựng xu hướng."];
      break;
    }
    case "comparison": {
      const comparison = analytics.periodComparison;
      bullets = comparison
        ? [
          `Doanh thu kỳ này ${formatVND(comparison.current_revenue)}, kỳ trước ${formatVND(comparison.previous_revenue)}${citation("period_comparison")}.`,
          comparison.revenue_delta_percent == null
            ? "Chưa thể tính tỷ lệ thay đổi vì kỳ trước không có doanh thu."
            : `Doanh thu ${comparison.revenue_delta_percent >= 0 ? "tăng" : "giảm"} ${Math.abs(comparison.revenue_delta_percent)}%${citation("period_comparison")}.`,
          comparison.profit_delta_percent == null
            ? "Chưa thể tính thay đổi lợi nhuận."
            : `Lợi nhuận ${comparison.profit_delta_percent >= 0 ? "tăng" : "giảm"} ${Math.abs(comparison.profit_delta_percent)}%${citation("period_comparison")}.`,
        ]
        : ["Chưa có đủ dữ liệu hai kỳ để so sánh."];
      break;
    }
    case "product_ranking":
      bullets = analytics.topProducts.slice(0, 5).map((row, index) =>
        `${index + 1}. ${row.product_name}: ${row.quantity} sản phẩm, doanh thu ${formatVND(row.revenue)}, lãi gộp ${formatVND(row.gross_profit)}${citation("top_products")}.`,
      );
      if (bullets.length === 0) bullets = ["Chưa có dữ liệu món bán trong kỳ."];
      break;
    case "category_analysis":
      bullets = analytics.categorySummary.slice(0, 5).map((row, index) =>
        `${index + 1}. ${row.category_name}: doanh thu ${formatVND(row.revenue)}, lãi gộp ${formatVND(row.gross_profit)}${citation("category_summary")}.`,
      );
      if (bullets.length === 0) bullets = ["Chưa có dữ liệu nhóm món trong kỳ."];
      break;
    case "channel_analysis":
      bullets = analytics.channelSummary.map((row) =>
        `${row.channel_name}: ${row.orders} đơn, doanh thu ${formatVND(row.revenue)}, phí ${formatVND(row.channel_fees)}${citation("channel_summary")}.`,
      );
      if (bullets.length === 0) bullets = ["Chưa có dữ liệu kênh bán trong kỳ."];
      break;
    case "inventory_risk": {
      const inventoryRows = executions.find((execution) => execution.call.name === "inventory_risk")?.rows ?? [];
      bullets = inventoryRows.slice(0, 10).map((row) =>
        `${String(row.item_name)}: tồn ${Number(row.quantity_on_hand).toLocaleString("vi-VN")} ${String(row.unit ?? "")}, trạng thái ${String(row.status)}.`,
      );
      if (bullets.length === 0) bullets = ["Không có mặt hàng âm kho, hết hàng hoặc sắp hết."];
      break;
    }
    case "dashboard":
      bullets = summary
        ? [
          `Dashboard ${analytics.range.label.toLocaleLowerCase("vi")} gồm doanh thu ${formatVND(summary.net_revenue)}, lợi nhuận ${formatVND(summary.net_profit)} và ${summary.total_orders} đơn.`,
          "Dashboard được dựng trực tiếp từ các RPC có kiểm soát và không thực thi HTML do AI tạo.",
        ]
        : ["Dashboard đã được tạo nhưng kỳ này chưa có dữ liệu bán hàng."];
      break;
    case "out_of_scope":
      bullets = [
        "Câu hỏi này nằm ngoài dữ liệu kinh doanh mà CounterOps đang quản lý.",
        "Bạn có thể hỏi về doanh thu, lợi nhuận, món, kênh bán, kho hoặc tài liệu đã upload.",
      ];
      break;
    default:
      return buildFallbackAnswer("", analytics, sources);
  }

  const warnings = assessment.qualityIssues
    .filter((issue) => issue.severity !== "info")
    .slice(0, 2)
    .map((issue) => `Lưu ý dữ liệu: ${issue.message}`);
  const anomalyNotes = assessment.anomalies
    .slice(0, 2)
    .map((anomaly) => `${anomaly.title}: ${anomaly.description}`);
  const finalBullets = [...bullets, ...warnings, ...anomalyNotes];
  return {
    answer: finalBullets.join(" "),
    bullets: finalBullets,
  };
}

export function buildFallbackAnswer(
  question: string,
  analytics: AiAnalyticsContext,
  sources: AiSource[],
) {
  const q = question.toLocaleLowerCase("vi");
  const summary = analytics.salesSummary;
  const topProduct = analytics.topProducts[0];
  const topChannel = analytics.channelSummary[0];
  const documentSources = sources.filter((source) => source.type === "document");
  let bullets: string[];

  if (/^(hi|hello|chào|xin chào)\b/.test(q)) {
    bullets = [
      "Mình có thể phân tích doanh thu, lợi nhuận, món bán chạy, kênh bán, tồn kho và tài liệu đã upload.",
      "Bạn cũng có thể yêu cầu tạo dashboard hoặc so sánh với kỳ trước.",
    ];
  } else if (q.includes("tài liệu") || q.includes("upload") || q.includes("document")) {
    bullets = documentSources.length > 0
      ? documentSources.slice(0, 4).map((source) => `${source.label}: ${source.excerpt ?? "Có dữ liệu liên quan."}`)
      : ["Chưa tìm thấy tài liệu phù hợp với câu hỏi."];
  } else if (q.includes("món") || q.includes("sản phẩm") || q.includes("top")) {
    bullets = analytics.topProducts.slice(0, 5).map((row, index) =>
      `${index + 1}. ${row.product_name}: doanh thu ${formatVND(row.revenue)}, lợi nhuận gộp ${formatVND(row.gross_profit)}.`,
    );
  } else if (q.includes("kênh") || q.includes("channel")) {
    bullets = analytics.channelSummary.map((row) =>
      `${row.channel_name}: ${formatVND(row.revenue)}, ${row.orders} đơn, phí ${formatVND(row.channel_fees)}.`,
    );
  } else {
    bullets = [
      summary
        ? `${analytics.range.label}: doanh thu ${formatVND(summary.net_revenue)}, lợi nhuận sau phí ${formatVND(summary.net_profit)}, ${summary.total_orders} đơn.`
        : `Chưa có dữ liệu bán hàng trong ${analytics.range.label.toLocaleLowerCase("vi")}.`,
      topProduct ? `Món đóng góp doanh thu cao nhất là ${topProduct.product_name}: ${formatVND(topProduct.revenue)}.` : "Chưa có dữ liệu top món.",
      topChannel ? `Kênh bán nổi bật là ${topChannel.channel_name}: ${formatVND(topChannel.revenue)}.` : "Chưa có dữ liệu kênh bán.",
    ];
  }

  return {
    answer: bullets.join(" "),
    bullets,
  };
}
