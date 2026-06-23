export interface TextChunk {
  index: number;
  content: string;
}

export function normalizeDocumentText(input: string): string {
  return input
    .replace(/\r\n/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[ \u00a0]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function chunkText(input: string, chunkSize = 1200, overlap = 180): TextChunk[] {
  const text = normalizeDocumentText(input);
  if (!text) return [];
  const chunks: TextChunk[] = [];
  let start = 0;
  while (start < text.length) {
    const hardEnd = Math.min(text.length, start + chunkSize);
    const slice = text.slice(start, hardEnd);
    const breakAt = hardEnd < text.length
      ? Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "), slice.lastIndexOf("; "))
      : -1;
    const end = breakAt > chunkSize * 0.55 ? start + breakAt + 1 : hardEnd;
    const content = text.slice(start, end).trim();
    if (content) chunks.push({ index: chunks.length, content });
    if (end >= text.length) break;
    const nextStart = Math.max(0, end - overlap);
    start = nextStart > start ? nextStart : end;
  }
  return chunks;
}

export function extractSearchTerms(question: string): string[] {
  const stopWords = new Set([
    "cho", "toi", "tôi", "cua", "của", "va", "và", "la", "là", "the", "về", "trong", "nay", "này",
    "what", "how", "why", "with", "from", "this", "that", "please",
  ]);
  return Array.from(
    new Set(
      question
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/đ/g, "d")
        .split(/[^a-z0-9]+/i)
        .filter((term) => term.length >= 3 && !stopWords.has(term))
    )
  ).slice(0, 8);
}
