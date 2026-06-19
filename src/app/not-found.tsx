import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4">
      <div className="rounded-lg border bg-card p-8 text-center shadow-sm">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="mt-2 text-lg font-semibold">Không tìm thấy trang</h1>
        <p className="mt-1 text-sm text-muted-foreground">Trang bạn yêu cầu không tồn tại hoặc đã bị xoá.</p>
        <Button asChild className="mt-4">
          <Link href="/dashboard">Về tổng quan</Link>
        </Button>
      </div>
    </div>
  );
}
