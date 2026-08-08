import { NextRequest, NextResponse } from "next/server";
import { aiChatRequestSchema } from "@/lib/ai/schemas";
import { imageToText } from "@/lib/ai/image-to-text";
import { canViewReports, getActiveMembership, requireActiveContext } from "@/lib/auth/permissions";
import { runAiAnalysis } from "@/server/ai/orchestrator";
import type { AiStreamEvent } from "@/types/ai";

export async function POST(request: NextRequest) {
  const active = await getActiveMembership();
  if (!active) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!canViewReports.includes(active.role)) {
    return NextResponse.json({ error: "Bạn không có quyền dùng trợ lý AI." }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = aiChatRequestSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({
      error: "Yêu cầu AI không hợp lệ.",
      details: parsed.error.issues.map((issue) => issue.message),
    }, { status: 400 });
  }

  const context = await requireActiveContext();
  const question = parsed.data.question ?? "[Xem ảnh đính kèm]";
  let imageText: string | undefined;
  if (parsed.data.image) {
    try {
      imageText = await imageToText(
        { data: parsed.data.image.data, mime: parsed.data.image.mime },
        question,
      );
    } catch (error) {
      return NextResponse.json({
        error: error instanceof Error ? error.message : "Không trích được văn bản từ ảnh.",
      }, { status: 422 });
    }
  }
  const runInput = {
    organizationId: context.organizationId,
    branchId: context.branchId,
    userId: context.userId,
    timezone: active.branch?.timezone ?? active.organization.timezone,
    question,
    mode: parsed.data.mode ?? "chat",
    sessionId: parsed.data.sessionId,
    requestId: parsed.data.requestId,
    imageText,
  } as const;

  if (parsed.data.stream) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enqueue = (event: AiStreamEvent) => {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        };
        void runAiAnalysis({
          ...runInput,
          onProgress: (stage, message) => enqueue({ type: "progress", stage, message }),
        })
          .then((response) => enqueue({ type: "result", data: response }))
          .catch((error) => enqueue({
            type: "error",
            error: error instanceof Error ? error.message : "Không thể xử lý yêu cầu AI.",
          }))
          .finally(() => controller.close());
      },
    });
    return new Response(stream, {
      headers: {
        "Cache-Control": "no-cache, no-transform",
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }

  try {
    const response = await runAiAnalysis(runInput);
    return NextResponse.json(response);
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Không thể xử lý yêu cầu AI.",
    }, { status: 500 });
  }
}
