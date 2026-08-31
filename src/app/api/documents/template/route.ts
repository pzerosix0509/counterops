import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { requireActiveContext } from "@/lib/auth/permissions";
import { TEMPLATE_FILES } from "@/server/documents/pdf/templates";

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

  const stat = fs.statSync(templatePath);
  const nodeStream = fs.createReadStream(templatePath);

  const webStream = new ReadableStream({
    start(controller) {
      nodeStream.on("data", (chunk) => {
        // Chunks can be Buffer or string; normalize to Uint8Array.
        const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        controller.enqueue(new Uint8Array(bytes));
      });
      nodeStream.on("end", () => controller.close());
      nodeStream.on("error", (err) => controller.error(err));
    },
    cancel() {
      nodeStream.destroy();
    },
  });

  return new Response(webStream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${file}"`,
      "Cache-Control": "private, no-store",
      "Content-Length": String(stat.size),
    },
  });
}
