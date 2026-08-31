import { describe, expect, it } from "vitest";
import {
  buildLineChartSpec,
  extractChartType,
  analyticsTimeseriesToChartArgs,
} from "@/lib/ai/render-line-chart";
import { buildAiPlan } from "@/lib/ai/semantic-layer";
import { buildChartForQuestion } from "@/server/ai/analytics";
import type { AiAnalyticsContext } from "@/types/ai";

describe("buildLineChartSpec", () => {
  it("returns a line chart spec for valid input", () => {
    const data = [
      { day: "2026-01-01", revenue: 100 },
      { day: "2026-01-02", revenue: 120 },
      { day: "2026-01-03", revenue: 90 },
    ];
    const spec = buildLineChartSpec({
      data,
      xLabel: "day",
      yLabel: "revenue",
      title: "Doanh thu 3 ngày",
    });
    expect(spec.type).toBe("line");
    expect(spec.title).toBe("Doanh thu 3 ngày");
    expect(spec.xKey).toBe("day");
    expect(spec.yKey).toBe("revenue");
    expect(spec.data).toEqual(data);
  });

  it("preserves the order of points and the exact numeric values", () => {
    const data = [
      { month: "Jan", sales: 10.5 },
      { month: "Feb", sales: 20.25 },
      { month: "Mar", sales: 30 },
    ];
    const spec = buildLineChartSpec({ data, xLabel: "month", yLabel: "sales", title: "t" });
    expect(spec.data).toHaveLength(3);
    expect(spec.data[1]).toEqual({ month: "Feb", sales: 20.25 });
  });

  it("throws when data is empty", () => {
    expect(() =>
      buildLineChartSpec({ data: [], xLabel: "x", yLabel: "y", title: "t" }),
    ).toThrow(/data phải có ít nhất 1 phần tử/);
  });

  it("throws when data is not an array", () => {
    expect(() =>
      buildLineChartSpec({ data: "nope" as unknown as Array<Record<string, unknown>>, xLabel: "x", yLabel: "y", title: "t" }),
    ).toThrow(/data phải là mảng/);
  });

  it("throws when xLabel is missing", () => {
    const data = [{ x: "a", y: 1 }];
    expect(() =>
      buildLineChartSpec({ data, xLabel: "", yLabel: "y", title: "t" }),
    ).toThrow(/xLabel phải là chuỗi/);
  });

  it("throws when yLabel is missing", () => {
    const data = [{ x: "a", y: 1 }];
    expect(() =>
      buildLineChartSpec({ data, xLabel: "x", yLabel: "", title: "t" }),
    ).toThrow(/yLabel phải là chuỗi/);
  });

  it("throws when title is missing", () => {
    const data = [{ x: "a", y: 1 }];
    expect(() =>
      buildLineChartSpec({ data, xLabel: "x", yLabel: "y", title: "" }),
    ).toThrow(/title phải là chuỗi/);
  });

  it("throws when no row has a numeric yLabel value", () => {
    const data = [
      { x: "a", revenue: "100" },
      { x: "b", revenue: null },
    ];
    expect(() =>
      buildLineChartSpec({ data, xLabel: "x", yLabel: "revenue", title: "t" }),
    ).toThrow(/không có phần tử nào có key "revenue" mang giá trị số/);
  });

  it("rejects data that exceeds the maximum number of points", () => {
    const data = Array.from({ length: 10_001 }, (_, i) => ({ x: String(i), y: i }));
    expect(() =>
      buildLineChartSpec({ data, xLabel: "x", yLabel: "y", title: "t" }),
    ).toThrow(/vượt quá 10000/);
  });

  it("rejects overlong title and labels", () => {
    const data = [{ x: "a", y: 1 }];
    expect(() =>
      buildLineChartSpec({ data, xLabel: "x", yLabel: "y", title: "t".repeat(201) }),
    ).toThrow(/title vượt quá 200/);
    expect(() =>
      buildLineChartSpec({ data, xLabel: "x".repeat(81), yLabel: "y", title: "t" }),
    ).toThrow(/xLabel\/yLabel vượt quá 80/);
  });

  it("accepts mixed rows as long as at least one has a numeric yLabel value", () => {
    const data = [
      { day: "2026-01-01", revenue: "—" },
      { day: "2026-01-02", revenue: 150 },
    ];
    const spec = buildLineChartSpec({ data, xLabel: "day", yLabel: "revenue", title: "t" });
    expect(spec.data).toHaveLength(2);
  });
});

describe("extractChartType", () => {
  it("returns null when no chart type is mentioned", () => {
    expect(extractChartType("Doanh thu hôm nay")).toBeNull();
    expect(extractChartType("Vẽ biểu đồ doanh thu 7 ngày qua")).toBeNull();
    expect(extractChartType("Top món bán chạy nhất")).toBeNull();
    expect(extractChartType("")).toBeNull();
  });

  it("detects English compound chart types", () => {
    expect(extractChartType("Show me a line chart of revenue")).toBe("line");
    expect(extractChartType("Pie chart for top products")).toBe("pie");
    expect(extractChartType("Bar chart of channel revenue")).toBe("bar");
    expect(extractChartType("Donut chart by category")).toBe("donut");
    expect(extractChartType("Area chart of forecast")).toBe("area");
    expect(extractChartType("Mixed chart for sales and profit")).toBe("composed");
  });

  it("detects Vietnamese 'biểu đồ <type>' / 'đồ thị <type>'", () => {
    expect(extractChartType("Vẽ biểu đồ đường doanh thu 7 ngày qua")).toBe("line");
    expect(extractChartType("Cho tôi biểu đồ tròn theo nhóm món")).toBe("pie");
    expect(extractChartType("Biểu đồ cột doanh thu kênh bán")).toBe("bar");
    expect(extractChartType("Đồ thị vùng dự báo doanh thu")).toBe("area");
    expect(extractChartType("Bieu do duong (khong dau)")).toBe("line");
  });

  it("detects 'vẽ' / 'draw' / 'render' + chart type", () => {
    expect(extractChartType("Vẽ line chart doanh thu")).toBe("line");
    expect(extractChartType("Vẽ bar chart cho tôi")).toBe("bar");
    expect(extractChartType("Draw a pie chart")).toBe("pie");
    expect(extractChartType("Vẽ donut cho kênh bán")).toBe("donut");
    expect(extractChartType("Vẽ line cho tôi")).toBe("line");
    expect(extractChartType("Vẽ cột doanh thu")).toBe("bar");
    expect(extractChartType("Vẽ đường biểu diễn")).toBe("line");
  });

  it("returns 'donut' rather than 'pie' when user explicitly asks for donut", () => {
    expect(extractChartType("Vẽ donut chart theo kênh")).toBe("donut");
  });
});

describe("analyticsTimeseriesToChartArgs", () => {
  const analytics = {
    range: { from: "2026-08-25T00:00:00+07:00", to: "2026-08-31T23:59:59+07:00", label: "7 ngày qua" },
    salesSummary: null,
    salesTimeseries: [
      {
        period_start: "2026-08-25T00:00:00+07:00",
        total_orders: 10,
        net_revenue: 1_500_000,
        cost_of_goods: 800_000,
        gross_profit: 700_000,
        channel_fees: 50_000,
        net_profit: 650_000,
      },
      {
        period_start: "2026-08-26T00:00:00+07:00",
        total_orders: 12,
        net_revenue: 1_800_000,
        cost_of_goods: 900_000,
        gross_profit: 900_000,
        channel_fees: 60_000,
        net_profit: 840_000,
      },
    ],
  } as unknown as AiAnalyticsContext;

  it("maps timeseries to chart args with revenue on the Y axis", () => {
    const args = analyticsTimeseriesToChartArgs(analytics, "Doanh thu 7 ngày");
    expect(args.xLabel).toBe("period");
    expect(args.yLabel).toBe("revenue");
    expect(args.title).toBe("Doanh thu 7 ngày");
    expect(args.data).toEqual([
      { period: "2026-08-25T00:00:00+07:00", revenue: 1_500_000 },
      { period: "2026-08-26T00:00:00+07:00", revenue: 1_800_000 },
    ]);
  });

  it("produces a valid line chart spec via buildLineChartSpec", () => {
    const args = analyticsTimeseriesToChartArgs(analytics, "t");
    const spec = buildLineChartSpec(args);
    expect(spec.type).toBe("line");
    expect(spec.xKey).toBe("period");
    expect(spec.yKey).toBe("revenue");
    expect(spec.data).toHaveLength(2);
  });
});

describe("buildAiPlan ensures sales_timeseries for chart requests", () => {
  // Bug user gặp: "vẽ linechart doanh thu 7 ngày qua" → intent = metric_lookup,
  // chỉ gọi sales_summary, không có timeseries, chart không được vẽ.
  // Fix: buildToolsForPlan phải tự thêm sales_timeseries khi user yêu cầu chart.
  it("adds sales_timeseries to the plan when user asks for a line chart", () => {
    const plan = buildAiPlan(
      "vẽ linechart doanh thu 7 ngày qua",
      "chat",
      new Date("2026-07-01T12:00:00+07:00"),
    );
    const toolNames = plan.tools.map((call) => call.name);
    expect(toolNames).toContain("sales_timeseries");
  });

  it("adds sales_timeseries for any explicit chart type request", () => {
    const cases = [
      "Vẽ line chart doanh thu tháng này",
      "Vẽ pie chart theo kênh bán",
      "Vẽ biểu đồ đường doanh thu 7 ngày qua",
      "Vẽ bar chart cho top món",
      "Vẽ donut chart theo nhóm món",
      "Draw an area chart of revenue",
    ];
    for (const question of cases) {
      const plan = buildAiPlan(question, "chat", new Date("2026-07-01T12:00:00+07:00"));
      const toolNames = plan.tools.map((call) => call.name);
      expect(toolNames, `Missing sales_timeseries for: ${question}`).toContain("sales_timeseries");
    }
  });

  it("does NOT add sales_timeseries when user does not ask for a chart", () => {
    const cases = [
      "Doanh thu hôm nay",
      "Top món bán chạy nhất",
      "Tồn kho còn bao nhiêu?",
      "Lợi nhuận tháng này?",
    ];
    for (const question of cases) {
      const plan = buildAiPlan(question, "chat", new Date("2026-07-01T12:00:00+07:00"));
      const toolNames = plan.tools.map((call) => call.name);
      expect(
        toolNames.includes("sales_timeseries"),
        `Unexpected sales_timeseries for: ${question}`,
      ).toBe(false);
    }
  });
});

describe("buildChartForQuestion honors user-requested chart type", () => {
  const analytics = {
    range: { from: "2026-08-25T00:00:00+07:00", to: "2026-08-31T23:59:59+07:00", label: "7 ngày qua" },
    salesSummary: null,
    salesTimeseries: [
      { period_start: "2026-08-25T00:00:00+07:00", total_orders: 10, net_revenue: 1_500_000, cost_of_goods: 800_000, gross_profit: 700_000, channel_fees: 50_000, net_profit: 650_000 },
      { period_start: "2026-08-26T00:00:00+07:00", total_orders: 12, net_revenue: 1_800_000, cost_of_goods: 900_000, gross_profit: 900_000, channel_fees: 60_000, net_profit: 840_000 },
    ],
    categorySummary: [
      { category_name: "Cà phê", revenue: 1_000_000, gross_profit: 500_000 },
      { category_name: "Trà", revenue: 800_000, gross_profit: 400_000 },
    ],
    channelSummary: [
      { channel_name: "Tại quán", revenue: 2_000_000, channel_fees: 0 },
      { channel_name: "Grab", revenue: 1_300_000, channel_fees: 100_000 },
    ],
    topProducts: [
      { product_name: "Espresso", revenue: 500_000, gross_profit: 300_000 },
    ],
    periodComparison: null,
    forecastRevenue: null,
    decomposition: null,
    statisticalFindings: null,
  } as unknown as AiAnalyticsContext;

  it("uses 'line' when user asks for line chart with timeseries data", () => {
    const chart = buildChartForQuestion("Vẽ line chart doanh thu 7 ngày qua", analytics);
    expect(chart?.type).toBe("line");
  });

  it("uses 'pie' when user asks for pie chart with category data", () => {
    const chart = buildChartForQuestion("Vẽ pie chart theo nhóm món", analytics);
    expect(chart?.type).toBe("pie");
  });

  it("uses 'bar' when user asks for bar chart with channel data", () => {
    const chart = buildChartForQuestion("Vẽ bar chart theo kênh bán", analytics);
    expect(chart?.type).toBe("bar");
  });

  it("falls back to default 'composed' when no chart type is mentioned", () => {
    // "bieu do doanh thu 7 ngay qua" - no specific type, has timeseries → composed
    const chart = buildChartForQuestion("Vẽ biểu đồ doanh thu 7 ngày qua", analytics);
    expect(chart?.type).toBe("composed");
  });
});
