import "server-only";
import fs from "fs";
import path from "path";
import os from "os";

export const PDF_CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_DIR = path.join(os.tmpdir(), "counterops-documents");

export interface CachedPdf {
  organizationId: string;
  fileName: string;
  createdAt: number;
  buffer: Buffer;
}

function metaPath(token: string): string {
  return path.join(CACHE_DIR, `${token}.json`);
}

function pdfPath(token: string): string {
  return path.join(CACHE_DIR, `${token}.pdf`);
}

function sweep() {
  try {
    if (!fs.existsSync(CACHE_DIR)) return;
    const cutoff = Date.now() - PDF_CACHE_TTL_MS;
    for (const file of fs.readdirSync(CACHE_DIR)) {
      if (!file.endsWith(".json")) continue;
      const token = file.slice(0, -5);
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), "utf8")) as { createdAt?: number };
        if (typeof meta.createdAt === "number" && meta.createdAt < cutoff) {
          fs.rmSync(pdfPath(token), { force: true });
          fs.rmSync(path.join(CACHE_DIR, file), { force: true });
        }
      } catch {
        fs.rmSync(path.join(CACHE_DIR, file), { force: true });
      }
    }
  } catch {
    // ignore sweep errors
  }
}

export function savePdf(token: string, entry: Omit<CachedPdf, "buffer"> & { buffer: Buffer }): void {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(metaPath(token), JSON.stringify({ organizationId: entry.organizationId, fileName: entry.fileName, createdAt: entry.createdAt }));
  fs.writeFileSync(pdfPath(token), entry.buffer);
  sweep();
}

export function loadPdf(token: string): CachedPdf | null {
  const metaFile = metaPath(token);
  const pdfFile = pdfPath(token);
  if (!fs.existsSync(metaFile) || !fs.existsSync(pdfFile)) return null;
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile, "utf8")) as Pick<CachedPdf, "organizationId" | "fileName" | "createdAt">;
    if (Date.now() - meta.createdAt > PDF_CACHE_TTL_MS) {
      fs.rmSync(metaFile, { force: true });
      fs.rmSync(pdfFile, { force: true });
      return null;
    }
    return { ...meta, buffer: fs.readFileSync(pdfFile) };
  } catch {
    fs.rmSync(metaFile, { force: true });
    fs.rmSync(pdfFile, { force: true });
    return null;
  }
}
