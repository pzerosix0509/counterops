"use client";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("App error:", error);
  }, [error]);
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="rounded-md border bg-card p-6 text-center text-sm shadow-sm">
        <p className="font-semibold text-destructive">Đã xảy ra lỗi</p>
        <p className="mt-1 text-muted-foreground">{error.message || "Vui lòng thử lại."}</p>
        <Button onClick={reset} className="mt-4">Thử lại</Button>
      </div>
    </div>
  );
}
