import { NextResponse } from "next/server";
import { requireActiveContext, requireRole } from "@/lib/auth/permissions";
import { getDocumentDefinition } from "@/server/documents/registry";
import { generateDocument, errorMessage } from "@/server/documents/service";
import { normalizeDocumentParams } from "@/lib/documents/params";
import type { GenerationPhase } from "@/server/documents/types";

export const dynamic = "force-dynamic";

interface GenerateBody {
  organizationId?: unknown;
  documentId?: unknown;
  params?: unknown;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as GenerateBody | null;
  if (
    !body
    || typeof body.organizationId !== "string"
    || typeof body.documentId !== "string"
  ) {
    return NextResponse.json({ error: "Thiếu thông tin tài liệu." }, { status: 400 });
  }

  const definition = getDocumentDefinition(body.documentId);
  if (!definition) return NextResponse.json({ error: "Không tìm thấy mẫu tài liệu." }, { status: 404 });

  // Validate the session and role before opening the stream so that any
  // redirect (login / onboarding / access-error) happens naturally.
  await requireActiveContext();
  await requireRole(body.organizationId, definition.allowedRoles);

  const params = normalizeDocumentParams(body.params);
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController | undefined;

  const stream = new ReadableStream({
    start(c) {
      controller = c;
    },
    cancel() {
      controller = undefined;
    },
  });

  void (async () => {
    const send = (payload: Record<string, unknown>) => {
      if (!controller) return;
      try {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      } catch {
        // stream closed
      }
    };
    try {
      const result = await generateDocument(body.organizationId as string, body.documentId as string, params, (phase: GenerationPhase) => {
        send({ phase });
      });
      send({ phase: "done", url: result.url, fileName: result.fileName });
    } catch (error) {
      send({ phase: "error", message: errorMessage(error) });
    } finally {
      try {
        controller?.close();
      } catch {
        // already closed
      }
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
