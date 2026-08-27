/**
 * Regression runner cho bộ eval — chạy khi `EVAL_REPORT=1` (npm run eval:ai).
 * Ghi report JSON vào eval-results/ + so sánh với lần chạy trước (history)
 * để phát hiện hồi quy khi đổi model/prompt/metric version.
 */
import { writeFileSync, mkdirSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { runEvalSuite, type EvalSuiteResult } from "@/lib/ai/eval/runner";
import { getVerifiedRepository } from "@/lib/ai/eval/load-verified";

const EVAL_RESULTS_DIR = join(process.cwd(), "eval-results");
const NOW = new Date("2026-08-04T12:00:00+07:00");

export interface EvalReport {
  generatedAt: string;
  catalogVersion: string;
  gitSha: string | null;
  results: EvalSuiteResult[];
  summary: {
    planning: number;
    numbers: number;
    quality: number;
    overall: number;
  };
  failedCaseIds: string[];
}

function gitSha(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
}

export async function runEvalForReport(): Promise<EvalReport> {
  const [planning, numbers, quality] = await Promise.all([
    runEvalSuite({ layer: "planning", now: NOW }),
    runEvalSuite({ layer: "numbers", now: NOW }),
    runEvalSuite({ layer: "quality", now: NOW }),
  ]);
  const results = [planning, numbers, quality];
  const failedCaseIds = results.flatMap((r) => r.cases.filter((c) => !c.passed).map((c) => c.caseId));
  return {
    generatedAt: new Date().toISOString(),
    catalogVersion: getVerifiedRepository().catalogVersion,
    gitSha: gitSha(),
    results,
    summary: {
      planning: planning.accuracy,
      numbers: numbers.accuracy,
      quality: quality.accuracy,
      overall: (planning.accuracy + numbers.accuracy + quality.accuracy) / 3,
    },
    failedCaseIds,
  };
}

export function writeEvalReport(report: EvalReport): string {
  mkdirSync(EVAL_RESULTS_DIR, { recursive: true });
  mkdirSync(join(EVAL_RESULTS_DIR, "history"), { recursive: true });

  writeFileSync(join(EVAL_RESULTS_DIR, "latest.json"), JSON.stringify(report, null, 2), "utf8");

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const historyPath = join(EVAL_RESULTS_DIR, "history", `${timestamp}.json`);
  writeFileSync(historyPath, JSON.stringify(report, null, 2), "utf8");

  // README summary
  const lines = [
    "# Eval report",
    "",
    `- Generated: ${report.generatedAt}`,
    `- Catalog version: ${report.catalogVersion}`,
    `- Git: ${report.gitSha ?? "unknown"}`,
    "",
    "| Layer | Accuracy |",
    "|-------|----------|",
    `| Planning | ${(report.summary.planning * 100).toFixed(1)}% |`,
    `| Numbers | ${(report.summary.numbers * 100).toFixed(1)}% |`,
    `| Quality | ${(report.summary.quality * 100).toFixed(1)}% |`,
    `| Overall | ${(report.summary.overall * 100).toFixed(1)}% |`,
    "",
    report.failedCaseIds.length > 0
      ? `Failed cases: ${report.failedCaseIds.join(", ")}`
      : "All cases passed.",
    "",
  ];
  writeFileSync(join(EVAL_RESULTS_DIR, "README.md"), lines.join("\n"), "utf8");

  return historyPath;
}

/** So sánh report hiện tại với các history gần nhất (cùng catalogVersion) */
export function compareWithHistory(report: EvalReport): string[] {
  const historyDir = join(EVAL_RESULTS_DIR, "history");
  if (!existsSync(historyDir)) return [];
  const files = readdirSync(historyDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .reverse();
  if (files.length <= 1) return [];

  const previous = files[1];
  try {
    const prev = JSON.parse(readFileSync(join(historyDir, previous), "utf8")) as EvalReport;
    const lines: string[] = [];
    for (const layer of ["planning", "numbers", "quality"] as const) {
      const before = prev.summary[layer] * 100;
      const after = report.summary[layer] * 100;
      const delta = after - before;
      lines.push(`${layer}: ${before.toFixed(1)}% → ${after.toFixed(1)}% (${delta > 0 ? "+" : ""}${delta.toFixed(1)}pp)`);
    }
    const newFails = report.failedCaseIds.filter((id) => !prev.failedCaseIds.includes(id));
    if (newFails.length > 0) lines.push(`New failures: ${newFails.join(", ")}`);
    return lines;
  } catch {
    return [];
  }
}

// Chạy eval + ghi report (chỉ được import từ scripts/eval-regression.test.ts,
// nên không ảnh hưởng `npm test` — file nằm ngoài include của vitest)
describe("AI eval regression report", () => {
  it("runs all layers and writes report", async () => {
    const report = await runEvalForReport();
    writeEvalReport(report);

      // eslint-disable-next-line no-console
      console.log("\n=== AI EVAL REPORT ===");
      // eslint-disable-next-line no-console
      console.log(`Planning: ${(report.summary.planning * 100).toFixed(1)}% | Numbers: ${(report.summary.numbers * 100).toFixed(1)}% | Quality: ${(report.summary.quality * 100).toFixed(1)}% | Overall: ${(report.summary.overall * 100).toFixed(1)}%`);
      if (report.failedCaseIds.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`Failed: ${report.failedCaseIds.join(", ")}`);
      }
      const comparison = compareWithHistory(report);
      if (comparison.length > 0) {
        // eslint-disable-next-line no-console
        console.log("\nSo với lần chạy trước:");
        for (const line of comparison) {
          // eslint-disable-next-line no-console
          console.log(`  ${line}`);
        }
      }

      // Regression: các layer phải ≥ ngưỡng (fail CI nếu hồi quy)
      expect(report.summary.planning).toBeGreaterThanOrEqual(0.95);
      expect(report.summary.numbers).toBeGreaterThanOrEqual(0.95);
      expect(report.summary.quality).toBeGreaterThanOrEqual(0.95);
  }, 60_000);
});
