import fs from "fs";
import path from "path";
import { PDFDocument, rgb, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import type { DocumentData } from "../types";
import { FONTS } from "./fonts";

const ASSET_DIR = path.join(process.cwd(), "src", "assets");

export const TEMPLATE_FILES: Record<string, string> = {
  "01-tb-ddkd": "01.TB-DDKD.pdf",
  "01-tkn-cnkd": "01.TKN-CNKD.pdf",
  "01-cnkd": "01.CNKD.pdf",
  "02-cnkd-tncn-qtt": "02.CNKD-TNCN-QTT.pdf",
  "01-bk-stk": "01.BK-STK.pdf",
};

export interface TextField {
  page: number;
  x: number;
  y: number;
  size: number;
  align?: "left" | "right";
  text: (data: DocumentData) => string;
}

export interface TickField {
  page: number;
  x: number;
  y: number;
  size: number;
  when: (data: DocumentData) => boolean;
}

export interface FillSpec {
  texts: TextField[];
  ticks: TickField[];
}

function fmt(value: number | null | undefined): string {
  return value == null ? "" : Math.round(value).toLocaleString("vi-VN");
}

function buildSpecs(documentId: string): FillSpec {
  switch (documentId) {
    case "01-tb-ddkd": {
      const boxes: Array<[DocumentData["params"]["thongBaoType"], number]> = [
        ["thanh_lap", 427],
        ["thay_doi", 411],
        ["tam_ngung", 394],
        ["khoi_phuc", 378],
        ["cham_dut", 361],
      ];
      return {
        texts: [
          { page: 1, x: 194.4, y: 578, size: 14, text: (d) => d.organizationName },
          { page: 1, x: 165.3, y: 556, size: 14, text: (d) => d.taxCode ?? "" },
        ],
        ticks: boxes.map(([type, y]) => ({
          page: 1,
          x: 85.1,
          y,
          size: 14,
          when: (d) => d.params.thongBaoType === type,
        })),
      };
    }

    case "01-tkn-cnkd": {
      const boxes: Array<[DocumentData["params"]["keKhaiType"], number]> = [
        ["duoi_1ty", 372],
        ["moi_ra", 355],
        ["hoan_thue", 338],
        ["khac", 321],
      ];
      return {
        texts: [
          { page: 1, x: 342, y: 227, size: 14, text: (d) => String(d.params.year) },
          { page: 1, x: 189.0, y: 160, size: 14, text: (d) => d.organizationName },
          { page: 1, x: 162.0, y: 143, size: 14, text: (d) => d.taxCode ?? "" },
        ],
        ticks: [
          ...boxes.map(([type, y]) => ({
            page: 1,
            x: 56.6,
            y,
            size: 14,
            when: (d: DocumentData) => d.params.keKhaiType === type,
          })),
          { page: 1, x: 263.7, y: 184, size: 14, when: (d) => !!d.params.lanDau },
        ],
      };
    }

    case "01-cnkd": {
      const boxes: Array<[string, number]> = [
        ["doanh_thu", 570],
        ["thu_nhap", 532],
        ["tmdt", 494],
        ["khac", 439],
      ];
      return {
        texts: [
          { page: 1, x: 340, y: 363, size: 14, text: (d) => (d.params.kyTinhThue === "thang" ? String(d.params.kyThang ?? "") : "") },
          { page: 1, x: 321, y: 341, size: 14, text: (d) => (d.params.kyTinhThue === "quy" ? String(d.params.kyQuy ?? "") : "") },
          { page: 1, x: 414, y: 319, size: 14, text: (d) => (d.params.kyTinhThue === "lan_phat_sinh" ? d.params.signatureDate.slice(5) : "") },
          { page: 1, x: 249.3, y: 274, size: 14, text: (d) => d.organizationName },
          { page: 1, x: 214, y: 252, size: 14, text: (d) => d.taxCode ?? "" },
        ],
        ticks: [
          ...boxes.map(([type, y]) => ({
            page: 1,
            x: 121.1,
            y,
            size: 14,
            when: (d: DocumentData) => d.params.doiTuong === type,
          })),
          { page: 1, x: 197.4, y: 296, size: 14, when: (d) => !!d.params.lanDau },
          { page: 1, x: 394.1, y: 296, size: 14, when: (d) => !d.params.lanDau },
        ],
      };
    }

    case "02-cnkd-tncn-qtt": {
      const address = (d: DocumentData) =>
        [d.streetAddress, d.commune, d.district, d.province].filter(Boolean).join(", ");
      return {
        texts: [
          { page: 1, x: 349, y: 612, size: 14, text: (d) => String(d.params.year) },
          { page: 1, x: 189.1, y: 545, size: 14, text: (d) => d.organizationName },
          { page: 1, x: 162.0, y: 524, size: 14, text: (d) => d.taxCode ?? "" },
          { page: 1, x: 231.1, y: 504, size: 14, text: address },
          { page: 1, x: 273.1, y: 483, size: 14, text: (d) => d.streetAddress ?? "" },
          { page: 1, x: 213.1, y: 462, size: 14, text: (d) => d.commune ?? "" },
          { page: 1, x: 159.0, y: 441, size: 14, text: (d) => d.province ?? "" },
          { page: 1, x: 560, y: 187, size: 14, align: "right", text: (d) => fmt(d.revenue) },
        ],
        ticks: [{ page: 1, x: 233.8, y: 590, size: 14, when: (d) => !!d.params.lanDau }],
      };
    }

    case "01-bk-stk":
      return {
        texts: [
          { page: 1, x: 150.0, y: 703, size: 14, text: (d) => d.organizationName },
          { page: 1, x: 126.0, y: 683, size: 14, text: (d) => d.taxCode ?? "" },
        ],
        ticks: [],
      };

    default:
      return { texts: [], ticks: [] };
  }
}

let serifBytes: Buffer | null = null;

export function templatePdfExists(documentId: string): boolean {
  const file = TEMPLATE_FILES[documentId];
  if (!file) return false;
  return fs.existsSync(path.join(ASSET_DIR, file));
}

/** Fill the real ministry template PDF (src/assets) with the given data. */
export async function fillTemplatePdf(documentId: string, data: DocumentData): Promise<Buffer> {
  const file = TEMPLATE_FILES[documentId];
  if (!file) throw new Error(`Không tìm thấy mẫu tài liệu: ${documentId}`);
  const templatePath = path.join(ASSET_DIR, file);
  if (!fs.existsSync(templatePath)) throw new Error(`Không tìm thấy file mẫu: ${file}`);

  if (!serifBytes) serifBytes = fs.readFileSync(FONTS.serif);

  const pdf = await PDFDocument.load(fs.readFileSync(templatePath), { ignoreEncryption: true });
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(serifBytes);

  const spec = buildSpecs(documentId);

  for (const field of spec.texts) {
    const text = field.text(data);
    if (!text) continue;
    const page = pdf.getPage(field.page - 1);
    const width = font.widthOfTextAtSize(text, field.size);
    const x = field.align === "right" ? field.x - width : field.x;
    page.drawText(text, { x, y: field.y, size: field.size, font, color: rgb(0, 0, 0) });
  }

  for (const tick of spec.ticks) {
    if (!tick.when(data)) continue;
    drawX(pdf.getPage(tick.page - 1), tick.x, tick.y, tick.size);
  }

  const bytes = await pdf.save({ useObjectStreams: false });
  return Buffer.from(bytes);
}

function drawX(page: PDFPage, x: number, y: number, size: number): void {
  const pad = size * 0.1;
  const top = y + size * 0.75;
  const bottom = y - size * 0.22;
  const innerX = x + pad;
  const outerX = x + size - pad;
  const thickness = Math.max(0.8, size * 0.09);
  const color = rgb(0, 0, 0);
  page.drawLine({ start: { x: innerX, y: bottom }, end: { x: outerX, y: top }, thickness, color });
  page.drawLine({ start: { x: innerX, y: top }, end: { x: outerX, y: bottom }, thickness, color });
}
