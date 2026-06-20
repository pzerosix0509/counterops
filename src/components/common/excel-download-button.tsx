"use client";

import { useTransition } from "react";
import { FileDown, Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import type { ActionResult } from "@/lib/utils/action-result";

interface DownloadButtonProps extends Omit<ButtonProps, "onClick"> {
  /** Server action that returns a base64-encoded XLSX payload. */
  action: () => Promise<ActionResult<{ fileName: string; base64: string; mime: string }>>;
  label: string;
  iconOnly?: boolean;
}

export function ExcelDownloadButton({ action, label, iconOnly, ...buttonProps }: DownloadButtonProps) {
  const [isPending, startTransition] = useTransition();

  function onClick() {
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        alert(res.error.message);
        return;
      }
      const binary = atob(res.data.base64);
      const len = binary.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: res.data.mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.data.fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  return (
    <Button variant="outline" onClick={onClick} disabled={isPending} {...buttonProps}>
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
      {iconOnly ? null : <span>{isPending ? "Đang tạo..." : label}</span>}
    </Button>
  );
}

