import PDFDocument from "pdfkit";
import { registerFonts, type RegisteredFonts } from "./fonts";

export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const MARGIN = 42;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export interface PageState {
  doc: PDFKit.PDFDocument;
  fonts: RegisteredFonts;
  y: number;
}

export function createDocument(): { doc: PDFKit.PDFDocument; fonts: RegisteredFonts } {
  const doc = new PDFDocument({ size: "A4", margin: MARGIN, bufferPages: true, autoFirstPage: true });
  const fonts = registerFonts(doc);
  return { doc, fonts };
}

export function formatMoney(value: number): string {
  return Math.round(value).toLocaleString("vi-VN");
}

function setFont(state: PageState, font: "sans" | "sansBold" | "serif" | "serifBold", size: number) {
  state.doc.font(state.fonts[font]).fontSize(size);
}

function drawText(state: PageState, text: string, opts: {
  x?: number;
  y?: number;
  size?: number;
  font?: "sans" | "sansBold" | "serif" | "serifBold";
  align?: "left" | "center" | "right" | "justify";
  maxWidth?: number;
  underline?: boolean;
  lineGap?: number;
}): void {
  const {
    x = MARGIN,
    y = state.y,
    size = 10,
    font = "sans",
    align = "left",
    maxWidth = CONTENT_WIDTH,
    underline = false,
    lineGap = 3,
  } = opts;
  setFont(state, font, size);
  state.doc.fillColor("black").text(text, x, y, { width: maxWidth, align, underline, lineGap });
  state.y = y + state.doc.heightOfString(text, { width: maxWidth, lineGap });
}

export function ensureSpace(state: PageState, needed: number): void {
  if (state.y + needed > PAGE_HEIGHT - MARGIN - 8) {
    state.doc.addPage();
    state.y = MARGIN;
  }
}

export function spacer(state: PageState, height: number): void {
  state.y += height;
}

export function hr(state: PageState, x = MARGIN, width = CONTENT_WIDTH): void {
  const y = state.y;
  state.doc.lineWidth(0.75).moveTo(x, y).lineTo(x + width, y).stroke();
  state.y = y + 6;
}

export function drawFormHeader(
  state: PageState,
  opts: { formCode: string; circular: string; title: string; subtitle?: string }
): void {
  const { formCode, circular, title, subtitle } = opts;
  const doc = state.doc;

  ensureSpace(state, 170);

  doc.lineWidth(0.75).moveTo(MARGIN, state.y).lineTo(PAGE_WIDTH - MARGIN, state.y).stroke();
  state.y += 4;

  drawText(state, `Mẫu số: ${formCode}`, { align: "right", size: 10, font: "sansBold" });
  drawText(state, `(Kèm theo ${circular})`, { align: "right", size: 8, font: "sans" });
  state.y += 8;

  drawText(state, "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM", { align: "center", size: 12, font: "serifBold" });
  drawText(state, "Độc lập - Tự do - Hạnh phúc", { align: "center", size: 11, font: "serif", underline: true });
  state.y += 6;

  drawText(state, title, { align: "center", size: 12.5, font: "sansBold" });
  if (subtitle) {
    state.y -= 4;
    drawText(state, subtitle, { align: "center", size: 9, font: "sans" });
  }
  state.y += 6;
  hr(state);
  state.y += 4;
}

export function sectionTitle(state: PageState, text: string): void {
  ensureSpace(state, 30);
  state.y += 6;
  drawText(state, text, { size: 10.5, font: "sansBold" });
  state.y += 2;
}

export function paragraph(state: PageState, text: string, opts?: { size?: number; align?: "left" | "center" | "right"; font?: "sans" | "sansBold" }): void {
  ensureSpace(state, 24);
  drawText(state, text, { size: opts?.size ?? 9.5, align: opts?.align ?? "left", font: opts?.font ?? "sans" });
  state.y += 2;
}

export interface FieldOpts {
  labelWidth?: number;
  valueWidth?: number;
  size?: number;
  x?: number;
  labelFont?: "sans" | "sansBold";
}

/** Draws "label: value" where the value is underlined. Returns the next y. */
export function field(state: PageState, label: string, value: string, opts: FieldOpts = {}): void {
  const { labelWidth = 150, valueWidth = CONTENT_WIDTH - 150, size = 9.5, x = MARGIN, labelFont = "sans" } = opts;
  const doc = state.doc;
  ensureSpace(state, 26);

  const labelLines = doc.heightOfString(label, { width: labelWidth });
  const valueLines = doc.heightOfString(value || " ", { width: valueWidth });

    setFont(state, labelFont, size);
    doc.fillColor("black").text(label, x, state.y, { width: labelWidth, lineGap: 2 });
    doc.fillColor("black").text(value, x + labelWidth, state.y, { width: valueWidth, lineGap: 2, underline: true });

  const height = Math.max(labelLines, valueLines);
  const lineBottom = state.y + height;
  if (value) {
    doc.lineWidth(0.4).moveTo(x + labelWidth, lineBottom + 2).lineTo(x + labelWidth + valueWidth, lineBottom + 2).stroke();
  }
  state.y = lineBottom + 6;
}

export function checkRow(state: PageState, label: string, checked: boolean, opts?: { indent?: number; size?: number }): void {
  const indent = opts?.indent ?? 0;
  const size = opts?.size ?? 9.5;
  ensureSpace(state, 18);
  drawText(state, `${checked ? "☑" : "☐"} ${label}`, { x: MARGIN + indent, size, maxWidth: CONTENT_WIDTH - indent });
  state.y += 2;
}

export interface TableColumn {
  header: string;
  width: number;
  align?: "left" | "center" | "right";
  bold?: boolean;
}

export interface TableOpts {
  startY?: number;
  fontSize?: number;
  headerSize?: number;
  cellPadding?: number;
  headerFill?: boolean;
}

/** Draws a bordered table with wrapping cells and automatic page breaks. Returns the next y. */
export function table(state: PageState, columns: TableColumn[], rows: Array<Array<string>>, opts: TableOpts = {}): void {
  const doc = state.doc;
  const startY = opts.startY ?? state.y;
  const fontSize = opts.fontSize ?? 9;
  const headerSize = opts.headerSize ?? 9;
  const padding = opts.cellPadding ?? 4;
  const headerFill = opts.headerFill ?? true;

  const lineGap = 2;
  const computeRowHeight = (cells: string[]): number => {
    let height = padding * 2;
    columns.forEach((col, i) => {
      const h = doc.heightOfString(cells[i] ?? "", {
        width: col.width - padding * 2,
        lineGap,
      });
      height = Math.max(height, h + padding * 2);
    });
    return height;
  };

  const drawRow = (y: number, cells: string[], size: number, bold: boolean): number => {
    setFont(state, bold ? "sansBold" : "sans", size);
    const height = computeRowHeight(cells);
    if (headerFill && bold) {
      doc.rect(MARGIN, y, CONTENT_WIDTH, height).fill("#eef1f5");
    }
    cells.forEach((cell, i) => {
      const col = columns[i];
      const cx = MARGIN + columns.slice(0, i).reduce((s, c) => s + c.width, 0);
      const align = col.align ?? "left";
      const textX = align === "right" ? cx + col.width - padding : cx + padding;
      doc.fillColor("black").text(cell, textX, y + padding, { width: col.width - padding * 2, align, lineGap });
    });
    return y + height;
  };

  let y = startY;
  ensureSpace(state, computeRowHeight(columns.map((c) => c.header)) + 30);

  const headerHeight = computeRowHeight(columns.map((c) => c.header));
  y = drawRow(y, columns.map((c) => c.header), headerSize, true);

  for (const row of rows) {
    const h = computeRowHeight(row);
    if (y + h > PAGE_HEIGHT - MARGIN - 8) {
      state.doc.addPage();
      y = MARGIN;
      state.y = MARGIN;
    }
    y = drawRow(y, row, fontSize, false);
  }

  // Borders
  const headerBottom = startY + headerHeight;
  const totalWidth = columns.reduce((s, c) => s + c.width, 0);
  doc.lineWidth(0.5);
  columns.forEach((col, i) => {
    const cx = MARGIN + columns.slice(0, i).reduce((s, c) => s + c.width, 0);
    doc.moveTo(cx, startY).lineTo(cx, y).stroke();
    if (i === columns.length - 1) doc.moveTo(cx + col.width, startY).lineTo(cx + col.width, y).stroke();
  });
  doc.moveTo(MARGIN, startY).lineTo(MARGIN + totalWidth, startY).stroke();
  doc.moveTo(MARGIN, y).lineTo(MARGIN + totalWidth, y).stroke();
  doc.moveTo(MARGIN, headerBottom).lineTo(MARGIN + totalWidth, headerBottom).stroke();

  state.y = y + 8;
}

export function signature(state: PageState, opts: { place: string; signerTitle: string }): void {
  const { place, signerTitle } = opts;
  ensureSpace(state, 150);

  drawText(state, place, { align: "center", size: 9.5 });
  state.y += 10;
  drawText(state, signerTitle, { align: "center", size: 10, font: "sansBold" });
  drawText(state, "(Chữ ký, ghi rõ họ tên)", { align: "center", size: 8.5 });
  state.y += 78;
  drawText(state, "Tôi cam đoan những nội dung kê khai trên là đúng và chịu trách nhiệm trước pháp luật về những nội dung đã khai./.", {
    size: 8.5,
  });
}

export function addPageNumbers(doc: PDFKit.PDFDocument): void {
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i += 1) {
    doc.switchToPage(range.start + i);
    const y = PAGE_HEIGHT - 20;
    doc.font("Sans").fontSize(8).fillColor("black").text(`Trang ${i + 1} / ${range.count}`, 0, y, {
      align: "center",
      width: PAGE_WIDTH,
    });
    doc.fillColor("black");
  }
  doc.switchToPage(range.start + range.count - 1);
}
