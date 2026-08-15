import { createDocument, addPageNumbers, type PageState } from "./layout";
import type { DocumentData } from "../types";
import { render01TbDdkd } from "./renderers/01-tb-ddkd";
import { render01TknCnkd } from "./renderers/01-tkn-cnkd";
import { render01Cnkd } from "./renderers/01-cnkd";
import { render02CnkdTncnQtt } from "./renderers/02-cnkd-tncn-qtt";
import { render01BkStk } from "./renderers/01-bk-stk";
import { fillTemplatePdf, templatePdfExists } from "./fill";

const RENDERERS: Record<string, (state: PageState, data: DocumentData) => void> = {
  "01-tb-ddkd": render01TbDdkd,
  "01-tkn-cnkd": render01TknCnkd,
  "01-cnkd": render01Cnkd,
  "02-cnkd-tncn-qtt": render02CnkdTncnQtt,
  "01-bk-stk": render01BkStk,
};

/**
 * Render a document. When the official ministry template PDF exists in
 * src/assets, fill it in place; otherwise fall back to the generated layout.
 */
export function renderDocumentPdf(documentId: string, data: DocumentData): Promise<Buffer> {
  if (templatePdfExists(documentId)) {
    return fillTemplatePdf(documentId, data);
  }

  const renderer = RENDERERS[documentId];
  if (!renderer) return Promise.reject(new Error(`Không tìm thấy mẫu tài liệu: ${documentId}`));

  return new Promise((resolve, reject) => {
    try {
      const { doc, fonts } = createDocument();
      const state: PageState = { doc, fonts, y: 42 };
      renderer(state, data);
      addPageNumbers(doc);
      const chunks: Buffer[] = [];
      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      doc.end();
    } catch (error) {
      reject(error);
    }
  });
}
