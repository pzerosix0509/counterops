import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  "supabase/migrations/20260814140000_analytics_rfm_sentiment_kmeans_demand.sql",
  "utf8",
);
const followUp = readFileSync(
  "supabase/migrations/20260814150000_analytics_cashier_select_and_demand_upsert.sql",
  "utf8",
);

describe("analytics migrations", () => {
  it("creates shared analytics tables and RPCs", () => {
    for (const token of [
      "customer_features",
      "rfm_segment_rules",
      "customer_feedback",
      "customer_clusters",
      "demand_forecasts",
      "refresh_customer_features",
      "ai_rfm_summary",
      "ai_rfm_customers",
      "ai_sentiment_summary",
      "ai_dish_demand_series",
    ]) {
      expect(sql).toContain(token);
    }
  });

  it("follow-up migration tightens cashier writes and demand upsert", () => {
    expect(followUp).toContain("unique nulls not distinct (branch_id, target_date, product_id, inventory_item_id)");
    expect(followUp).toContain("array['owner', 'admin', 'manager']");
    expect(followUp).not.toMatch(/refresh_customer_features[\s\S]*cashier/);
  });
});
