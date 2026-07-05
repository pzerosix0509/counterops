"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canViewReports, requireActiveContext, requireRole } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { chunkText, normalizeDocumentText } from "@/lib/ai/chunk";
import { embedTexts, vectorToSql } from "@/lib/ai/embeddings";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";

const uploadDocumentSchema = z.object({
  branchId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(160),
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().max(120).nullable().optional(),
  content: z.string().min(1),
});

export async function uploadAiDocument(
  organizationId: string,
  input: unknown
): Promise<ActionResult<{ documentId: string; chunks: number; embedded: number }>> {
  const membership = await requireRole(organizationId, canViewReports);
  const activeContext = await requireActiveContext();
  const parsed = uploadDocumentSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Tài liệu không hợp lệ.");
  if (
    activeContext.organizationId !== organizationId
    || (parsed.data.branchId && parsed.data.branchId !== activeContext.branchId)
  ) {
    return actionFail("FORBIDDEN", "Bạn không có quyền upload tài liệu cho chi nhánh này.");
  }

  const content = normalizeDocumentText(parsed.data.content);
  if (content.length < 20) return actionFail("VALIDATION_ERROR", "Tài liệu quá ngắn để tạo ngữ cảnh AI.");
  if (content.length > 500_000) return actionFail("VALIDATION_ERROR", "Tài liệu quá lớn. Vui lòng chia nhỏ trước khi upload.");

  const chunks = chunkText(content);
  if (chunks.length === 0) return actionFail("VALIDATION_ERROR", "Không tạo được đoạn dữ liệu từ tài liệu.");

  const embeddingResult = await embedTexts(chunks.map((chunk) => chunk.content)).catch(() => null);
  const branchId = activeContext.branchId;
  const supabase = createSupabaseServerClient();
  const { data: doc, error: docError } = await supabase
    .from("ai_documents")
    .insert({
      organization_id: membership.organization.id,
      branch_id: branchId,
      title: parsed.data.title,
      file_name: parsed.data.fileName,
      mime_type: parsed.data.mimeType ?? null,
      source_type: "upload",
      uploaded_by: membership.membership.user_id,
    })
    .select("id")
    .single();
  if (docError || !doc) return actionFail("INTERNAL_ERROR", "Không lưu được tài liệu: " + (docError?.message ?? ""));

  const { error: chunkError } = await supabase.from("ai_document_chunks").insert(
    chunks.map((chunk, index) => ({
      organization_id: membership.organization.id,
      branch_id: branchId,
      document_id: doc.id,
      chunk_index: chunk.index,
      content: chunk.content,
      embedding: embeddingResult?.vectors[index] ? vectorToSql(embeddingResult.vectors[index]) : null,
      embedding_model: embeddingResult?.vectors[index] ? embeddingResult.model : null,
    }))
  );
  if (chunkError) {
    await supabase.from("ai_documents").delete().eq("id", doc.id);
    return actionFail("INTERNAL_ERROR", "Không lưu được đoạn dữ liệu tài liệu: " + chunkError.message);
  }

  await supabase.from("audit_logs").insert({
    organization_id: membership.organization.id,
    branch_id: branchId,
    actor_user_id: membership.membership.user_id,
    action: "ai.document.upload",
    entity_type: "ai_documents",
    entity_id: doc.id,
    after: {
      title: parsed.data.title,
      fileName: parsed.data.fileName,
      chunks: chunks.length,
      embedded: embeddingResult?.vectors.length ?? 0,
      embeddingModel: embeddingResult?.model ?? null,
    },
  });

  revalidatePath("/ai");
  return actionOk({ documentId: doc.id, chunks: chunks.length, embedded: embeddingResult?.vectors.length ?? 0 });
}
