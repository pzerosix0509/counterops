import { NextResponse } from "next/server";
import { requireActiveContext } from "@/lib/auth/permissions";
import { getCachedPdf } from "@/server/documents/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ error: "Thiếu mã tài liệu." }, { status: 400 });

  const ctx = await requireActiveContext();
  const entry = getCachedPdf(token);
  if (!entry) return NextResponse.json({ error: "Tài liệu đã hết hạn. Vui lòng tạo lại." }, { status: 404 });
  if (entry.organizationId !== ctx.organizationId) {
    return NextResponse.json({ error: "Không có quyền xem tài liệu này." }, { status: 403 });
  }

  return new Response(new Uint8Array(entry.buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${entry.fileName}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
