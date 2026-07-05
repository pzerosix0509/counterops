import { describe, expect, it } from "vitest";
import { assessAiEvidence } from "@/lib/ai/assessment";
import { AiCircuitBreaker, runWithTimeout } from "@/lib/ai/circuit-breaker";
import { buildAiPlan } from "@/lib/ai/semantic-layer";
import { aiToolCacheKey, clearAiToolCache, withAiToolCache } from "@/server/ai/cache";
import { expandAiDocumentQuery, extractDocumentIdentifiers, rerankAiDocumentCandidates } from "@/server/queries/ai";
import type { AiAnalyticsContext, AiSource, AiToolExecution } from "@/types/ai";

const emptyAnalytics: AiAnalyticsContext = {
  range: {
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-07-01T23:59:59.999Z",
    label: "Hôm nay",
  },
  salesSummary: null,
  topProducts: [],
  channelSummary: [],
  salesTimeseries: [],
  categorySummary: [],
  periodComparison: null,
};

describe("AI circuit breaker", () => {
  it("opens after consecutive failures and closes after cooldown", () => {
    const breaker = new AiCircuitBreaker({ failureThreshold: 2, cooldownMs: 1_000 });
    expect(breaker.canRequest("provider", 100)).toBe(true);
    breaker.recordFailure("provider", 100);
    expect(breaker.canRequest("provider", 200)).toBe(true);
    breaker.recordFailure("provider", 200);
    expect(breaker.canRequest("provider", 500)).toBe(false);
    expect(breaker.canRequest("provider", 1_201)).toBe(true);
  });

  it("aborts operations that exceed the timeout", async () => {
    await expect(runWithTimeout(5, (signal) => new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, 100);
      signal.addEventListener("abort", () => {
        clearTimeout(timer);
        reject(new DOMException("Aborted", "AbortError"));
      });
    }))).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("AI tenant-scoped tool cache", () => {
  it("reuses a result only for the exact tenant and arguments", async () => {
    clearAiToolCache();
    let loads = 0;
    const base = {
      organizationId: "org-a",
      branchId: "branch-a",
      tool: "sales_summary",
      arguments: { from: "a", to: "b" },
    };
    const first = await withAiToolCache(aiToolCacheKey(base), async () => ++loads, 1_000);
    const second = await withAiToolCache(aiToolCacheKey(base), async () => ++loads, 1_000);
    const otherTenant = await withAiToolCache(aiToolCacheKey({
      ...base,
      organizationId: "org-b",
    }), async () => ++loads, 1_000);

    expect(first).toEqual({ value: 1, hit: false });
    expect(second).toEqual({ value: 1, hit: true });
    expect(otherTenant).toEqual({ value: 2, hit: false });
  });

  it("reuses a key for rolling timestamps in the same cache bucket", () => {
    const first = aiToolCacheKey({
      organizationId: "org-a",
      branchId: "branch-a",
      tool: "sales_summary",
      arguments: {
        p_from: "2026-07-02T08:01:10.000Z",
        p_to: "2026-07-02T08:03:20.000Z",
      },
    });
    const second = aiToolCacheKey({
      organizationId: "org-a",
      branchId: "branch-a",
      tool: "sales_summary",
      arguments: {
        p_from: "2026-07-02T08:01:50.000Z",
        p_to: "2026-07-02T08:04:40.000Z",
      },
    });

    expect(first).toBe(second);
  });
});

describe("AI intent and evidence guardrails", () => {
  it("does not mistake a document code containing KHO for inventory intent", () => {
    const plan = buildAiPlan("Theo tài liệu, mã KHO-E2E-5729 dùng khi nào?", "chat");
    expect(plan.intent).toBe("document_search");
    expect(plan.tools.map((tool) => tool.name)).toEqual(["search_documents"]);
  });

  it("marks sparse and strongly declining data as lower confidence", () => {
    const analytics: AiAnalyticsContext = {
      ...emptyAnalytics,
      salesSummary: {
        total_orders: 1,
        net_revenue: 100_000,
        cost_of_goods: 60_000,
        gross_profit: 40_000,
        channel_fees: 0,
        net_profit: 40_000,
      },
      periodComparison: {
        current_orders: 1,
        previous_orders: 20,
        orders_delta_percent: -95,
        current_revenue: 100_000,
        previous_revenue: 2_000_000,
        revenue_delta_percent: -95,
        current_profit: 40_000,
        previous_profit: 800_000,
        profit_delta_percent: -95,
      },
    };
    const executions = [{
      call: {
        id: "tool-1",
        name: "sales_summary",
        arguments: { from: analytics.range.from, to: analytics.range.to, rangeLabel: analytics.range.label },
      },
      rows: [analytics.salesSummary!],
      durationMs: 10,
    }] satisfies AiToolExecution[];
    const assessment = assessAiEvidence(analytics, executions, []);

    expect(assessment.qualityIssues.map((issue) => issue.code)).toContain("small_sample");
    expect(assessment.anomalies.map((anomaly) => anomaly.code)).toContain("revenue_change");
    expect(assessment.confidence.level).not.toBe("high");
  });
});

describe("AI document retrieval", () => {
  it("extracts document identifiers from natural questions", () => {
    expect(extractDocumentIdentifiers("Theo tài liệu KHO-E2E-5729 thì xử lý sao?")).toEqual(["kho-e2e-5729"]);
  });

  it("requires exact identifier matches before returning document chunks", () => {
    const candidates = [
      {
        id: "wrong",
        document_id: "doc-a",
        title: "Quy trình kho",
        file_name: "inventory.txt",
        chunk_index: 0,
        content: "Biên bản kiểm kê được lập khi tồn kho lệch số liệu.",
        similarity: 0.95,
        fusion_score: 0.1,
        keyword_rank: 1,
        semantic_rank: 1,
      },
      {
        id: "right",
        document_id: "doc-b",
        title: "Quy trình KHO-E2E-5729",
        file_name: "kho-e2e-5729.txt",
        chunk_index: 0,
        content: "KHO-E2E-5729 yêu cầu lập biên bản khi xuất hủy hàng hóa.",
        similarity: 0.45,
        fusion_score: 0.02,
        keyword_rank: null,
        semantic_rank: 2,
      },
    ];

    const reranked = rerankAiDocumentCandidates(
      candidates,
      "Theo tài liệu, khi nào phải lập biên bản KHO-E2E-5729?",
      3,
    );

    expect(reranked.map((row) => row.id)).toEqual(["right"]);
  });

  it("returns no document chunks when an identifier is absent", () => {
    const candidates = [
      {
        id: "wrong",
        document_id: "doc-a",
        title: "Quy trình kho",
        file_name: "inventory.txt",
        chunk_index: 0,
        content: "Biên bản kiểm kê được lập khi tồn kho lệch số liệu.",
        similarity: 0.95,
        fusion_score: 0.1,
        keyword_rank: 1,
        semantic_rank: 1,
      },
    ];

    const reranked = rerankAiDocumentCandidates(
      candidates,
      "Theo tài liệu, khi nào phải lập biên bản KHO-E2E-5729?",
      3,
    );

    expect(reranked).toEqual([]);
  });

  it("expands domain queries and reranks exact, diverse matches", () => {
    expect(expandAiDocumentQuery("quy trình tồn kho")).toContain("kiểm kê");
    const candidates = [
      {
        id: "a1",
        document_id: "a",
        title: "Quy trình tồn kho",
        file_name: "a.txt",
        chunk_index: 0,
        content: "Quy trình tồn kho yêu cầu kiểm kê mỗi ngày.",
        similarity: 0.7,
        fusion_score: 0.04,
        keyword_rank: 1,
        semantic_rank: 1,
      },
      {
        id: "a2",
        document_id: "a",
        title: "Quy trình tồn kho",
        file_name: "a.txt",
        chunk_index: 1,
        content: "Một đoạn khác về tồn kho.",
        similarity: 0.68,
        fusion_score: 0.039,
        keyword_rank: 2,
        semantic_rank: 2,
      },
      {
        id: "b1",
        document_id: "b",
        title: "Kiểm kê",
        file_name: "b.txt",
        chunk_index: 0,
        content: "Kiểm kê và đối chiếu tồn kho.",
        similarity: 0.65,
        fusion_score: 0.038,
        keyword_rank: 3,
        semantic_rank: 3,
      },
    ];
    const reranked = rerankAiDocumentCandidates(candidates, "quy trình tồn kho", 3);
    expect(reranked[0]?.id).toBe("a1");
    expect(new Set(reranked.map((row) => row.document_id)).size).toBe(2);
  });

  it("lowers confidence when document retrieval returns no source", () => {
    const executions = [{
      call: {
        id: "tool-1",
        name: "search_documents",
        arguments: { query: "quy trình", limit: 6 },
      },
      rows: [],
      durationMs: 10,
    }] satisfies AiToolExecution[];
    const sources: AiSource[] = [];
    const assessment = assessAiEvidence(emptyAnalytics, executions, sources);
    expect(assessment.qualityIssues.map((issue) => issue.code)).toContain("no_relevant_document");
  });
});
