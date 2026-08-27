import path from "path";

export const FONT_DIR = path.join(process.cwd(), "src", "server", "documents", "fonts");

export const FONTS = {
  sans: path.join(FONT_DIR, "DejaVuSans.ttf"),
  sansBold: path.join(FONT_DIR, "DejaVuSans-Bold.ttf"),
  serif: path.join(FONT_DIR, "Times_New_Roman.ttf"),
  serifBold: path.join(FONT_DIR, "DejaVuSerif-Bold.ttf"),
} as const;

export interface RegisteredFonts {
  sans: "Sans";
  sansBold: "SansBold";
  serif: "Serif";
  serifBold: "SerifBold";
}

export function registerFonts(doc: PDFKit.PDFDocument): RegisteredFonts {
  doc.registerFont("Sans", FONTS.sans);
  doc.registerFont("SansBold", FONTS.sansBold);
  doc.registerFont("Serif", FONTS.serif);
  doc.registerFont("SerifBold", FONTS.serifBold);
  return { sans: "Sans", sansBold: "SansBold", serif: "Serif", serifBold: "SerifBold" };
}
