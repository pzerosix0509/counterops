/**
 * Loader Verified Query Repository (Snowflake-style).
 * - `purpose: "guidance"` → exemplar được phép inject prompt (few-shot).
 * - `purpose: "eval"` → chỉ dùng chấm điểm, KHÔNG bao giờ inject vào prompt
 *   (tránh "học thuộc").
 */
import { z } from "zod";
import verifiedQueriesJson from "@/lib/ai/eval/verified-queries.json";

const verifiedQuerySchema = z.object({
  id: z.string(),
  question: z.string(),
  semanticQuery: z
    .object({
      metric: z.string(),
      dimensions: z.array(z.string()).optional(),
      grain: z.string().optional(),
      comparison: z.string().optional(),
    })
    .optional(),
  expectedValue: z.record(z.string(), z.union([z.number(), z.string()])).optional(),
  expectedIntent: z.string().optional(),
  expectedTools: z.array(z.string()).optional(),
  expectedRangeLabel: z.string().optional(),
  requiredSources: z.array(z.string()).optional(),
  expectedClarification: z.boolean().optional(),
  /** Tên data-quality scenario (quality layer) */
  scenario: z.string().optional(),
  /** Mã quality issue phải xuất hiện (quality layer) */
  expectedQualityIssues: z.array(z.string()).optional(),
  /** Ngày phải có anomaly (quality layer, outlier-day) */
  expectedAnomalyDate: z.string().optional(),
  purpose: z.enum(["eval", "guidance"]),
  layer: z.enum(["planning", "numbers", "quality"]).optional(),
});

const repositorySchema = z.object({
  catalogVersion: z.string(),
  verifiedAt: z.string(),
  queries: z.array(verifiedQuerySchema),
});

export type VerifiedQuery = z.infer<typeof verifiedQuerySchema>;
export interface VerifiedRepository {
  catalogVersion: string;
  verifiedAt: string;
  queries: VerifiedQuery[];
  evalQueries: VerifiedQuery[];
  guidanceQueries: VerifiedQuery[];
}

export function loadVerifiedRepository(): VerifiedRepository {
  const parsed = repositorySchema.safeParse(verifiedQueriesJson);
  if (!parsed.success) {
    throw new Error(`Verified Query Repository không hợp lệ: ${parsed.error.message}`);
  }
  const { catalogVersion, verifiedAt, queries } = parsed.data;
  return {
    catalogVersion,
    verifiedAt,
    queries,
    evalQueries: queries.filter((q) => q.purpose === "eval"),
    guidanceQueries: queries.filter((q) => q.purpose === "guidance"),
  };
}

let cached: VerifiedRepository | null = null;
export function getVerifiedRepository(): VerifiedRepository {
  if (!cached) cached = loadVerifiedRepository();
  return cached;
}

/** Eval queries dùng để chấm — KHÔNG inject vào prompt */
export function getEvalQueries(): VerifiedQuery[] {
  return getVerifiedRepository().evalQueries;
}

/** Guidance queries — được phép dùng làm exemplar */
export function getGuidanceQueries(): VerifiedQuery[] {
  return getVerifiedRepository().guidanceQueries;
}
