import { NextResponse } from "next/server";
import { z } from "zod";
import { canViewReports, getActiveMembership } from "@/lib/auth/permissions";
import { listAiChatMessages } from "@/server/ai/conversations";

const paramsSchema = z.object({ sessionId: z.string().uuid() });

export async function GET(
  _request: Request,
  { params }: { params: { sessionId: string } },
) {
  const active = await getActiveMembership();
  if (!active) return NextResponse.json({ error: "Chưa đăng nhập." }, { status: 401 });
  if (!canViewReports.includes(active.role)) {
    return NextResponse.json({ error: "Bạn không có quyền dùng trợ lý AI." }, { status: 403 });
  }
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) return NextResponse.json({ error: "Session không hợp lệ." }, { status: 400 });

  try {
    return NextResponse.json({ messages: await listAiChatMessages(parsed.data.sessionId) });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Không tải được cuộc trò chuyện.",
    }, { status: 500 });
  }
}
