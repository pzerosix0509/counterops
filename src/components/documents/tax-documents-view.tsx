"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { DOCUMENTS, getDocumentDefinition } from "@/server/documents/registry";
import { cn } from "@/lib/utils/format";

export function TaxDocumentsView() {
  const [selectedId, setSelectedId] = useState<string>(() => DOCUMENTS[0]?.id ?? "");
  const [infoId, setInfoId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const definition = getDocumentDefinition(selectedId);
  const infoDoc = DOCUMENTS.find((d) => d.id === infoId) ?? null;

  useEffect(() => {
    setPdfLoaded(false);
    const timer = setTimeout(() => setPdfLoaded(true), 6000);
    return () => clearTimeout(timer);
  }, [selectedId]);

  const handleEnter = (id: string) => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    setHoveredId(id);
  };

  const handleLeave = (id: string) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      setHoveredId((prev) => (prev === id ? null : prev));
      hideTimer.current = null;
    }, 250);
  };

  return (
    <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-start">
      <div className="order-1 flex flex-col gap-1.5 lg:order-2 lg:w-64">
        <div className="w-full">
          <p className="text-xs font-semibold text-foreground/90">Chọn chứng từ để xem trước</p>
          <p className="text-[11px] text-muted-foreground">Di chuột để xem thông tin, bấm để đổi mẫu PDF.</p>
        </div>
        <div className="flex w-full flex-row gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
          {DOCUMENTS.map((doc) => (
          <div
            key={doc.id}
            className="relative"
            onMouseEnter={() => handleEnter(doc.id)}
            onMouseLeave={() => handleLeave(doc.id)}
          >
            <button
              type="button"
              onClick={() => {
                setSelectedId(doc.id);
                setInfoId(doc.id);
              }}
              aria-pressed={doc.id === selectedId}
              title={doc.title}
              className={cn(
                "flex w-full items-center gap-2 whitespace-nowrap rounded-md border px-3 py-2 text-left transition-colors",
                doc.id === selectedId
                  ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                  : "border-border hover:bg-muted/60"
              )}
            >
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{doc.title}</span>
            </button>

            {hoveredId === doc.id && (
              <div className="absolute right-full top-0 z-30 mr-2 hidden w-72 max-w-[calc(100vw-2rem)] rounded-lg border bg-card p-3 shadow-lg lg:block">
                <span className="font-mono text-[11px] text-muted-foreground">{doc.formCode}</span>
                <p className="mt-1 text-sm font-semibold leading-snug">{doc.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{doc.description}</p>
                <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">{doc.circular}</p>
              </div>
            )}
          </div>
        ))}
        </div>
      </div>

      {infoDoc && (
        <div className="order-1 rounded-lg border bg-card p-3 lg:hidden">
          <span className="font-mono text-[11px] text-muted-foreground">{infoDoc.formCode}</span>
          <p className="mt-1 text-sm font-semibold leading-snug">{infoDoc.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{infoDoc.description}</p>
          <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground/80">{infoDoc.circular}</p>
        </div>
      )}

      <div className="order-2 min-w-0 flex-1 overflow-hidden rounded-lg border bg-card lg:order-1">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {definition && (
              <span className="shrink-0 rounded border bg-muted/60 px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                {definition.formCode}
              </span>
            )}
            <h2 className="truncate text-sm font-semibold">{definition?.title ?? "Chưa chọn chứng từ"}</h2>
          </div>
          <p className="text-xs text-muted-foreground">{definition?.circular}</p>
        </div>
        <div className="relative h-[70vh] bg-muted/20 lg:h-[78vh]">
          {definition && (
            <iframe
              key={definition.id}
              src={`/api/documents/template?id=${definition.id}`}
              className="h-full w-full"
              title={definition.title}
              onLoad={() => setPdfLoaded(true)}
            />
          )}
          {definition && !pdfLoaded && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Đang tải mẫu tài liệu…</p>
            </div>
          )}
          {!definition && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <FileText className="h-10 w-10 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Chọn một chứng từ để xem mẫu PDF.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
