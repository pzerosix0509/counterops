import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260814140000_analytics_rfm_sentiment_kmeans_demand.sql",
  "utf8",
);

describe("analytics migration", () => {
  it("creates shared analytics tables and RPCs", () => {
    for (const token of [
      "customer_features",
      "rfm_segment_rules",
      "customer_feedback",
      "customer_clusters",
      "demand_forecasts",
      "refresh_customer_features",
      "ai_rfm_summary",
      "ai_sentiment_summary",
      "ai_dish_demand_series",
    ]) {
      expect(sql).toContain(token);
    }
  });
});
