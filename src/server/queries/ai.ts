import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { embedText, vectorToSql } from "@/lib/ai/embeddings";
import { extractSearchTerms } from "@/lib/ai/chunk";
import type { AiSource } from "@/types/ai";
import type { AiDashboardTemplate, AiDocument } from "@/types/database";

interface AiDocumentCandidate {
  id: string;
  document_id: string;
  title?: string | null;
  file_name?: string | null;
  chunk_index: number;
  content: string;
  similarity?: number | null;
  fusion_score?: number | null;
  keyword_rank?: number | null;
  semantic_rank?: number | null;
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("vi")
    .replace(/đ/g, "d");
}

export function extractDocumentIdentifiers(value: string) {
  const matches = value.match(/\b(?=[A-Z0-9_-]{5,}\b)(?=[A-Z0-9_-]*[A-Z])(?=[A-Z0-9_-]*\d)[A-Z0-9]+(?:[-_][A-Z0-9]+)+\b/gi);
  return Array.from(new Set(
    (matches ?? [])
      .map((item) => normalizeSearchText(item).trim())
      .filter(Boolean),
  ));
}

export function expandAiDocumentQuery(question: string) {
  const normalized = normalizeSearchText(question);
  const expansions: string[] = [];
  const synonymGroups = [
    { triggers: ["kho", "ton kho"], terms: ["nguyên liệu", "kiểm kê", "nhập hàng"] },
    { triggers: ["nhap hang", "phieu nhap"], terms: ["nhà cung cấp", "tồn kho"] },
    { triggers: ["huy", "hao hut"], terms: ["xuất hủy", "thất thoát"] },
    { triggers: ["quy trinh", "huong dan"], terms: ["quy định", "thao tác"] },
  ];
  for (const group of synonymGroups) {
    if (group.triggers.some((trigger) => normalized.includes(trigger))) {
      expansions.push(...group.terms);
    }
  }
  return [question.trim(), ...Array.from(new Set(expansions))].filter(Boolean).join(" ");
}

export function rerankAiDocumentCandidates(
  rows: AiDocumentCandidate[],
  question: string,
  limit = 6,
) {
  const terms = extractSearchTerms(question);
  const identifiers = extractDocumentIdentifiers(question);
  const normalizedQuestion = normalizeSearchText(question).trim();
  const scored = rows
    .map((row) => {
      const haystack = normalizeSearchText(`${row.title ?? ""} ${row.file_name ?? ""} ${row.content ?? ""}`);
      const termCoverage = terms.length > 0
        ? terms.filter((term) => haystack.includes(term)).length / terms.length
        : 0;
      const identifierCoverage = identifiers.length > 0
        ? identifiers.filter((identifier) => haystack.includes(identifier)).length / identifiers.length
        : 1;
      const exactPhrase = normalizedQuestion.length >= 8 && haystack.includes(normalizedQuestion) ? 1 : 0;
      const similarity = Number(row.similarity ?? 0);
      return {
        ...row,
        termCoverage,
        identifierCoverage,
        rerankScore:
          Number(row.fusion_score ?? 0)
          + identifierCoverage * 0.08
          + termCoverage * 0.025
          + exactPhrase * 0.03
          + similarity * 0.01,
      };
    })
    .filter((row) =>
      row.identifierCoverage >= 1
      && (
        row.termCoverage > 0
        || Number(row.similarity ?? 0) >= 0.2
        || row.keyword_rank != null
      ),
    )
    .sort((left, right) => right.rerankScore - left.rerankScore);

  const selected: typeof scored = [];
  const chunksPerDocument = new Map<string, number>();
  while (scored.length > 0 && selected.length < limit) {
    scored.sort((left, right) => {
      const leftPenalty = (chunksPerDocument.get(left.document_id) ?? 0) * 0.015;
      const rightPenalty = (chunksPerDocument.get(right.document_id) ?? 0) * 0.015;
      return (right.rerankScore - rightPenalty) - (left.rerankScore - leftPenalty);
    });
    const next = scored.shift();
    if (!next) break;
    if ((chunksPerDocument.get(next.document_id) ?? 0) >= 2) continue;
    selected.push(next);
    chunksPerDocument.set(next.document_id, (chunksPerDocument.get(next.document_id) ?? 0) + 1);
  }
  return selected;
}

export async function listAiDocuments(organizationId: string): Promise<AiDocument[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_documents")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listAiDashboardTemplates(organizationId: string): Promise<AiDashboardTemplate[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from("ai_dashboard_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(12);
  if (error) return [];
  return data ?? [];
}

async function keywordSearchAiDocumentChunks(
  organizationId: string,
  question: string,
  limit: number,
): Promise<AiSource[]> {
  const supabase = createSupabaseServerClient();
  const terms = extractSearchTerms(question);
  const identifiers = extractDocumentIdentifiers(question);
  if (terms.length === 0) return [];
  const orFilter = terms.map((term) => `content.ilike.%${term}%`).join(",");
  const { data, error } = await supabase
    .from("ai_document_chunks")
    .select("id, document_id, chunk_index, content, ai_documents!inner(title, file_name)")
    .eq("organization_id", organizationId)
    .or(orFilter)
    .limit(limit);
  if (error) return [];
  return (data ?? [])
    .filter((row: any) => {
      if (identifiers.length === 0) return true;
      const haystack = normalizeSearchText(`${row.ai_documents?.title ?? ""} ${row.ai_documents?.file_name ?? ""} ${row.content ?? ""}`);
      return identifiers.every((identifier) => haystack.includes(identifier));
    })
    .map((row: any) => ({
    id: row.id,
    type: "document",
    label: row.ai_documents?.title ?? row.ai_documents?.file_name ?? "Tài liệu",
    detail: `Keyword · Đoạn ${Number(row.chunk_index) + 1}`,
    excerpt: String(row.content ?? "").slice(0, 900),
    meta: {
      search: "keyword",
      documentId: row.document_id,
      chunkId: row.id,
      chunkIndex: Number(row.chunk_index),
    },
  }));
}

export async function searchAiDocumentChunks(
  organizationId: string,
  branchId: string,
  question: string,
  limit = 6,
): Promise<AiSource[]> {
  const embedding = await embedText(question).catch(() => null);
  const supabase = createSupabaseServerClient();
  const expandedQuery = expandAiDocumentQuery(question);
  const candidateCount = Math.min(Math.max(limit * 4, 12), 40);
  const { data, error } = await supabase.rpc("hybrid_search_ai_document_chunks", {
    p_org_id: organizationId,
    p_branch_id: branchId,
    p_query_text: expandedQuery,
    p_query_embedding: embedding ? vectorToSql(embedding.vector) : null,
    p_match_count: candidateCount,
    p_full_text_weight: 1.1,
    p_semantic_weight: 1,
    p_rrf_k: 50,
  });

  if (!error && data && data.length > 0) {
    const reranked = rerankAiDocumentCandidates(
      data as AiDocumentCandidate[],
      question,
      limit,
    );

    return reranked.map((row) => ({
      id: row.id,
      type: "document",
      label: row.title ?? row.file_name ?? "Tài liệu",
      detail: `Hybrid${row.similarity == null ? "" : ` ${(Number(row.similarity) * 100).toFixed(0)}%`} · Đoạn ${Number(row.chunk_index) + 1}`,
      excerpt: String(row.content ?? "").slice(0, 900),
      meta: {
        search: "hybrid",
        rpc: "hybrid_search_ai_document_chunks",
        expandedQuery,
        candidateCount: data.length,
        embeddingModel: embedding?.model ?? null,
        similarity: row.similarity == null ? null : Number(row.similarity),
        fusionScore: Number(row.fusion_score),
        rerankScore: row.rerankScore,
        keywordRank: row.keyword_rank,
        semanticRank: row.semantic_rank,
        documentId: row.document_id,
        chunkId: row.id,
        chunkIndex: Number(row.chunk_index),
      },
    }));
  }

  return keywordSearchAiDocumentChunks(organizationId, expandedQuery, limit);
}
