import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireActiveContext } from "@/lib/auth/permissions";
import { TEMPLATE_FILES } from "@/server/documents/pdf/fill";

export const dynamic = "force-dynamic";

const ASSET_DIR = path.join(process.cwd(), "src", "assets");

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Thiếu mã mẫu tài liệu." }, { status: 400 });

  const file = TEMPLATE_FILES[id];
  if (!file) return NextResponse.json({ error: "Không tìm thấy mẫu tài liệu." }, { status: 404 });

  await requireActiveContext();

  const templatePath = path.join(ASSET_DIR, file);
  if (!fs.existsSync(templatePath)) {
    return NextResponse.json({ error: "Không tìm thấy file mẫu." }, { status: 404 });
  }

  return new Response(new Uint8Array(fs.readFileSync(templatePath)), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
