import { describe, expect, it } from "vitest";
import {
  CATALOG_VERSION,
  METRIC_CATALOG,
  getDimension,
  getMetric,
  normalizeCatalogText,
  resolveMetricFromText,
} from "@/lib/ai/metric-catalog";

describe("metric catalog", () => {
  it("has a version and consistent metrics", () => {
    expect(CATALOG_VERSION).toBe("1.0.0");
    expect(METRIC_CATALOG.version).toBe(CATALOG_VERSION);
    expect(METRIC_CATALOG.metrics.length).toBeGreaterThanOrEqual(6);
    for (const m of METRIC_CATALOG.metrics) {
      expect(m.key).toBeTruthy();
      expect(m.version).toBeTruthy();
      expect(m.rpc).toBeTruthy();
      expect(m.aliases.length).toBeGreaterThan(0);
    }
    // version đồng nhất trong catalog hiện tại
    expect(new Set(METRIC_CATALOG.metrics.map((m) => m.version)).size).toBe(1);
  });

  it("defines the core revenue/profit metrics with reconciliation rules", () => {
    const netRevenue = getMetric("net_revenue");
    expect(netRevenue?.reconciliation?.sumsTo).toEqual({ metric: "net_revenue", source: "timeseries" });
    expect(netRevenue?.reconciliation?.tolerancePct).toBe(0.005);
    // net_profit = gross_profit - channel_fees
    const netProfit = getMetric("net_profit");
    expect(netProfit?.formula).toContain("channel_fees");
  });

  it("has dimensions with Vietnamese aliases", () => {
    expect(getDimension("channel")?.aliases).toContain("kenh ban");
    expect(getDimension("product")?.valuesSource).toBe("products");
  });

  it("normalizes Vietnamese diacritics", () => {
    expect(normalizeCatalogText("Doanh thu tháng này")).toContain("doanh thu thang nay");
  });

  it("resolves metrics from aliases with and without diacritics", () => {
    expect(resolveMetricFromText("Doanh thu hôm nay là bao nhiêu?")?.key).toBe("net_revenue");
    expect(resolveMetricFromText("doanh thu thuan")?.key).toBe("net_revenue");
    expect(resolveMetricFromText("Lợi nhuận sau phí tuần này?")?.key).toBe("net_profit");
    expect(resolveMetricFromText("Giá vốn tháng này")?.key).toBe("cost_of_goods");
    expect(resolveMetricFromText("bao nhiêu đơn hôm nay?")?.key).toBe("total_orders");
  });

  it("prefers more specific alias (net_profit over gross_profit over generic)", () => {
    // "lợi nhuận sau phí" phải khớp net_profit, không phải gross_profit
    expect(resolveMetricFromText("Lợi nhuận sau phí tháng này?")?.key).toBe("net_profit");
    expect(resolveMetricFromText("Lợi nhuận gộp tháng này?")?.key).toBe("gross_profit");
  });

  it("returns null when no metric alias matches", () => {
    expect(resolveMetricFromText("xin chao")).toBeNull();
  });
});
