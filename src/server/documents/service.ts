import "server-only";
import crypto from "crypto";
import { requireActiveContext, requireRole } from "@/lib/auth/permissions";
import { getDocumentDefinition } from "./registry";
import { assembleDocumentData, getOrganization } from "./data";
import { renderDocumentPdf } from "./pdf";
import { loadPdf, savePdf, type CachedPdf } from "./cache";
import type { DocumentParams, GenerationPhase } from "./types";

export type PhaseListener = (phase: GenerationPhase) => void;

function safeMessage(error: unknown): string {
  if (error instanceof Error) {
    if (typeof (error as { digest?: unknown }).digest === "string") {
      return "Phiên làm việc đã thay đổi. Vui lòng thử lại.";
    }
    return error.message;
  }
  return "Đã xảy ra lỗi không xác định.";
}

export async function generateDocument(
  organizationId: string,
  documentId: string,
  params: DocumentParams,
  onPhase: PhaseListener
): Promise<{ url: string; fileName: string; size: number }> {
  onPhase("authenticating");
  const definition = getDocumentDefinition(documentId);
  if (!definition) throw new Error("Không tìm thấy mẫu tài liệu.");
  await requireRole(organizationId, definition.allowedRoles);

  onPhase("loading-data");
  const ctx = await requireActiveContext();
  const organization = await getOrganization(organizationId);
  if (!organization) throw new Error("Không tìm thấy thông tin cửa hàng.");
  const data = await assembleDocumentData(ctx, params, organization);

  onPhase("rendering");
  const buffer = await renderDocumentPdf(documentId, data);

  onPhase("finalizing");
  const token = crypto.randomBytes(24).toString("hex");
  savePdf(token, {
    organizationId: ctx.organizationId,
    buffer,
    fileName: definition.fileName,
    createdAt: Date.now(),
  });

  return { url: `/api/documents/preview?token=${token}`, fileName: definition.fileName, size: buffer.length };
}

export function getCachedPdf(token: string): CachedPdf | null {
  return loadPdf(token);
}

export function errorMessage(error: unknown): string {
  return safeMessage(error);
}
