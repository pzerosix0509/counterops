"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canViewReports, requireActiveContext, requireRole } from "@/lib/auth/permissions";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { chunkText, normalizeDocumentText } from "@/lib/ai/chunk";
import { embedTexts, vectorToSql } from "@/lib/ai/embeddings";
import { imageToText } from "@/lib/ai/image-to-text";
import { validateDocumentContentLength } from "@/lib/ai/upload";
import { uploadDocumentSchema } from "@/lib/validation/upload";
import { actionFail, actionOk, type ActionResult } from "@/lib/utils/action-result";

async function extractDocumentText(input: {
  content?: string;
  binary?: { data: string; mime: string };
  title: string;
}): Promise<{ content: string; mimeType: string | null }> {
  if (input.content) return { content: input.content, mimeType: null };
  const binary = input.binary!;
  const mime = binary.mime.toLowerCase();

  if (mime === "application/pdf" || input.title.toLowerCase().endsWith(".pdf")) {
    // Lazy import to keep server action bundle lean (pdf-parse v2 API)
    const { PDFParse } = await import("pdf-parse");
    const parser = new PDFParse({ data: Buffer.from(binary.data, "base64") });
    try {
      const result = await parser.getText();
      return { content: result?.text ?? "", mimeType: "application/pdf" };
    } finally {
      await parser.destroy().catch(() => {});
    }
  }

  if (mime.startsWith("image/")) {
    const text = await imageToText({ data: binary.data, mime }, input.title);
    return { content: text, mimeType: mime };
  }

  // Fallback: treat as UTF-8 text
  const text = Buffer.from(binary.data, "base64").toString("utf-8");
  return { content: text, mimeType: mime };
}

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

  let extracted: { content: string; mimeType: string | null };
  try {
    extracted = await extractDocumentText({
      content: parsed.data.content,
      binary: parsed.data.binary,
      title: parsed.data.fileName,
    });
  } catch {
    return actionFail("VALIDATION_ERROR", "Không trích được văn bản từ tệp. Vui lòng dùng tệp text, PDF hoặc ảnh rõ nét.");
  }

  const content = normalizeDocumentText(extracted.content);
  const tooShort = validateDocumentContentLength(content, extracted.mimeType);
  if (tooShort) return actionFail("VALIDATION_ERROR", tooShort);
  if (content.length === 0) return actionFail("VALIDATION_ERROR", "Không trích được văn bản từ tệp. Vui lòng dùng tệp text, PDF hoặc ảnh rõ nét.");

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
      mime_type: parsed.data.mimeType ?? extracted.mimeType,
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

const deleteDocumentSchema = z.object({
  documentId: z.string().uuid(),
}).strict();

export async function deleteAiDocument(
  organizationId: string,
  input: unknown
): Promise<ActionResult<{ deleted: boolean }>> {
  const membership = await requireRole(organizationId, canViewReports);
  const activeContext = await requireActiveContext();
  const parsed = deleteDocumentSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Tài liệu không hợp lệ.");

  const supabase = createSupabaseServerClient();
  const { data: doc, error: docError } = await supabase
    .from("ai_documents")
    .select("id, title, branch_id")
    .eq("id", parsed.data.documentId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (docError || !doc) return actionFail("NOT_FOUND", "Không tìm thấy tài liệu.");
  if (
    activeContext.organizationId !== organizationId
    || (doc.branch_id && doc.branch_id !== activeContext.branchId)
  ) {
    return actionFail("FORBIDDEN", "Bạn không có quyền xóa tài liệu này.");
  }

  // ai_document_chunks.document_id has on delete cascade.
  const { error } = await supabase.from("ai_documents").delete().eq("id", doc.id);
  if (error) return actionFail("INTERNAL_ERROR", `Không xóa được tài liệu: ${error.message}`);

  await supabase.from("audit_logs").insert({
    organization_id: membership.organization.id,
    branch_id: activeContext.branchId,
    actor_user_id: membership.membership.user_id,
    action: "ai.document.delete",
    entity_type: "ai_documents",
    entity_id: doc.id,
    before: {
      title: doc.title,
    },
  });

  revalidatePath("/ai");
  return actionOk({ deleted: true });
}
