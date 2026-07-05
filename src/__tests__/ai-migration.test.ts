import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("AI analytics migration", () => {
  const migration = readFileSync(
    join(process.cwd(), "supabase", "migrations", "20260701131012_ai_conversations_and_analytics.sql"),
    "utf8",
  );

  it("schema-qualifies pgvector cosine operators when search_path is empty", () => {
    expect(migration).not.toMatch(/\bembedding\s*<=>/);
    expect(migration.match(/OPERATOR\(extensions\.<=>\)/g)).toHaveLength(3);
  });

  it("persists runtime telemetry without changing AI table access policies", () => {
    const telemetryMigration = readFileSync(
      join(process.cwd(), "supabase", "migrations", "20260702072140_ai_runtime_telemetry.sql"),
      "utf8",
    );
    expect(telemetryMigration).toContain("add column if not exists telemetry jsonb");
    expect(telemetryMigration).toContain("add column if not exists confidence_score");
    expect(telemetryMigration).not.toMatch(/security\s+definer/i);
    expect(telemetryMigration).not.toMatch(/create\s+policy/i);
  });
});
