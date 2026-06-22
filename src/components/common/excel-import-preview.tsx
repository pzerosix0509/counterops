"use client";

import { useRef, useState, useTransition } from "react";
import { FileUp, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { ActionResult } from "@/lib/utils/action-result";
import { notifyError, notifySuccess } from "@/hooks/use-notify";

export interface ImportPreviewRow {
  rowNumber: number;
  data: Record<string, unknown>;
}

export interface ImportPreviewPayload {
  totalRows: number;
  validCount: number;
  errorCount: number;
  cleaned: ImportPreviewRow[];
  errors: Array<{
    rowNumber: number;
    issues: Array<{ field: string; column?: string; message: string; code: string }>;
  }>;
  commitToken: string;
  fileName: string;
}

type DialogPhase = "idle" | "previewing" | "preview" | "committing" | "done" | "error";

interface ExcelImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityLabel: string;
  columns: Array<{ key: string; header: string }>;
  previewAction: (payload: { fileName: string; contentBase64: string }) => Promise<ActionResult<ImportPreviewPayload>>;
  commitAction: (preview: ImportPreviewPayload) => Promise<ActionResult<unknown>>;
  templateAction: () => Promise<ActionResult<{ fileName: string; base64: string; mime: string }>>;
  onCommitted?: () => void;
  successLabel?: string;
}

/**
 * Reusable Excel import dialog: pick a file, preview the validated
 * rows, then commit. Rejects a file when the preview has zero valid
 * rows. Row-level validation errors are shown inline.
 */
export function ExcelImportDialog(props: ExcelImportDialogProps) {
  const {
    open,
    onOpenChange,
    entityLabel,
    columns,
    previewAction,
    commitAction,
    templateAction,
    onCommitted,
    successLabel = "Import thành công",
  } = props;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [phase, setPhase] = useState<DialogPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportPreviewPayload | null>(null);
  const [templatePending, setTemplatePending] = useState(false);

  function reset() {
    setPhase("idle");
    setErrorMessage(null);
    setPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function onPick() {
    fileInputRef.current?.click();
  }

  function onTemplate() {
    setTemplatePending(true);
    startTransition(async () => {
      const res = await templateAction();
      setTemplatePending(false);
      if (!res.ok) {
        setErrorMessage(res.error.message);
        notifyError('T?i t?p m?u th?t b?i', res.error.message);
        return;
      }
      downloadBase64(res.data.base64, res.data.fileName, res.data.mime);
      notifySuccess('Ðã t?i t?p m?u', res.data.fileName);
    });
  }

  async function onFileChosen(file: File) {
    setPhase("previewing");
    setErrorMessage(null);
    try {
      const buffer = await file.arrayBuffer();
      const base64 = arrayBufferToBase64(buffer);
      const res = await previewAction({ fileName: file.name, contentBase64: base64 });
      if (!res.ok) {
        setPhase("error");
        setErrorMessage(res.error.message);
        notifyError("Không xem tru?c du?c t?p", res.error.message);
        return;
      }
      setPreview(res.data);
      setPhase("preview");
    } catch (e) {
      setPhase("error");
      setErrorMessage(e instanceof Error ? e.message : "Ðã x?y ra l?i khi d?c t?p.");
      notifyError("Không d?c du?c t?p", e instanceof Error ? e.message : undefined);
    }
  }

  function onCommit() {
    if (!preview) return;
    setPhase("committing");
    setErrorMessage(null);
    startTransition(async () => {
      const res = await commitAction(preview);
      if (!res.ok) {
        setPhase("error");
        setErrorMessage(res.error.message);
        notifyError("Import th?t b?i", res.error.message);
        return;
      }
      setPhase("done");
      notifySuccess("Import thành công", `Ðã ghi ${preview.validCount} dòng.`);
      onCommitted?.();
    });
  }

  function close() {
    onOpenChange(false);
    setTimeout(reset, 250);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
        else onOpenChange(true);
      }}
    >
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import {entityLabel} t? Excel</DialogTitle>
          <DialogDescription>
            T?i t?p m?u, di?n d? li?u r?i t?i lên. H? th?ng xem tru?c các dòng h?p l? tru?c khi ghi vào co s? d? li?u.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFileChosen(file);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={onTemplate} disabled={templatePending || isPending}>
              <Download className="h-4 w-4" /> T?i t?p m?u
            </Button>
            <Button onClick={onPick} disabled={phase === "previewing" || phase === "committing"}>
              <FileUp className="h-4 w-4" /> Ch?n t?p .xlsx
            </Button>
          </div>
          {preview ? (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="success">{preview.validCount} h?p l?</Badge>
              {preview.errorCount > 0 ? (
                <Badge variant="danger">{preview.errorCount} l?i</Badge>
              ) : null}
              <span>{preview.fileName}</span>
            </div>
          ) : null}
        </div>

        {errorMessage ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
            {errorMessage}
          </p>
        ) : null}

        {preview ? (
          <div className="max-h-80 space-y-3 overflow-auto rounded-md border p-2">
            {preview.errors.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">
                  {preview.errors.length} dòng c?n s?a l?i
                </p>
                <div className="space-y-2">
                  {preview.errors.map((err) => (
                    <div key={err.rowNumber} className="rounded-md border border-rose-200 bg-rose-50 p-2 text-xs">
                      <p className="font-semibold">Dòng {err.rowNumber}</p>
                      <ul className="ml-4 list-disc">
                        {err.issues.map((iss, idx) => (
                          <li key={idx}>
                            <span className="font-mono">[{iss.column ?? iss.field}]</span> {iss.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {preview.cleaned.length > 0 ? (
              <div>
                <p className="mb-1 text-sm font-medium">S? ghi {preview.cleaned.length} dòng</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      {columns.map((c) => (
                        <TableHead key={c.key}>{c.header}</TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preview.cleaned.slice(0, 50).map((row) => (
                      <TableRow key={row.rowNumber}>
                        <TableCell className="font-mono text-xs">{row.rowNumber}</TableCell>
                        {columns.map((c) => (
                          <TableCell key={c.key} className="text-xs">
                            {formatCell(row.data[c.key])}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {preview.cleaned.length > 50 ? (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Hi?n th? 50 dòng d?u trong t?ng s? {preview.cleaned.length}.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            Chua có t?p nào du?c ch?n. T?i t?p m?u, di?n d? li?u r?i ch?n t?p d? xem tru?c.
          </p>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={close} disabled={isPending}>
            {phase === "done" ? "Ðóng" : "Hu?"}
          </Button>
          <Button
            onClick={onCommit}
            disabled={!preview || preview.validCount === 0 || isPending || phase === "done"}
          >
            {phase === "committing" ? "Ðang ghi..." : successLabel}
          </Button>
        </DialogFooter>
        {phase === "done" ? (
          <p className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            {successLabel}. B?n có th? dóng h?p tho?i.
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Có" : "Không";
  if (typeof value === "number") return value.toString();
  return String(value);
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk))
    );
  }
  if (typeof btoa === "function") return btoa(binary);
  return Buffer.from(binary, "binary").toString("base64");
}

function downloadBase64(base64: string, fileName: string, mime: string) {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
