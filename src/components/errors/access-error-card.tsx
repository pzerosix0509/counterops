import Link from "next/link";
import { Button } from "@/components/ui/button";
import { resolveAccessError } from "@/lib/errors/codes";

export function AccessErrorCard({ code }: { code?: string }) {
  const error = resolveAccessError(code);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">{error.code === "unknown" ? "Lỗi" : error.code}</p>
        <h1 className="mt-2 text-lg font-semibold text-destructive">{error.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{error.description}</p>
        <Button asChild className="mt-4">
          <Link href="/">Về trang chủ</Link>
        </Button>
      </div>
    </div>
  );
}
