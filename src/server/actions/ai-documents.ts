"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { canViewReports, requireRole } from "@/lib/auth/permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { chunkText, normalizeDocumentText } from "@/lib/ai/chunk";
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
): Promise<ActionResult<{ documentId: string; chunks: number }>> {
  const membership = await requireRole(organizationId, canViewReports);
  const parsed = uploadDocumentSchema.safeParse(input);
  if (!parsed.success) return actionFail("VALIDATION_ERROR", "Tài liệu không hợp lệ.");

  const content = normalizeDocumentText(parsed.data.content);
  if (content.length < 20) return actionFail("VALIDATION_ERROR", "Tài liệu quá ngắn để tạo ngữ cảnh AI.");
  if (content.length > 500_000) return actionFail("VALIDATION_ERROR", "Tài liệu quá lớn. Vui lòng chia nhỏ trước khi upload.");

  const chunks = chunkText(content);
  if (chunks.length === 0) return actionFail("VALIDATION_ERROR", "Không tạo được đoạn dữ liệu từ tài liệu.");

  const branchId = parsed.data.branchId ?? membership.branch?.id ?? null;
  const admin = createSupabaseAdminClient();
  const { data: doc, error: docError } = await admin
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

  const { error: chunkError } = await admin.from("ai_document_chunks").insert(
    chunks.map((chunk) => ({
      organization_id: membership.organization.id,
      branch_id: branchId,
      document_id: doc.id,
      chunk_index: chunk.index,
      content: chunk.content,
    }))
  );
  if (chunkError) return actionFail("INTERNAL_ERROR", "Không lưu được đoạn dữ liệu tài liệu: " + chunkError.message);

  await admin.from("audit_logs").insert({
    organization_id: membership.organization.id,
    branch_id: branchId,
    actor_user_id: membership.membership.user_id,
    action: "ai.document.upload",
    entity_type: "ai_documents",
    entity_id: doc.id,
    after: { title: parsed.data.title, fileName: parsed.data.fileName, chunks: chunks.length },
  });

  revalidatePath("/ai");
  return actionOk({ documentId: doc.id, chunks: chunks.length });
}
