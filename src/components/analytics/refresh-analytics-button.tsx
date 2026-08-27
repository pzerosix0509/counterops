"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { notifyError, notifySuccess } from "@/hooks/use-notify";
import { refreshCustomerAnalytics } from "@/server/actions/analytics";

export function RefreshAnalyticsButton({ canRefresh }: { canRefresh: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  if (!canRefresh) return null;

  function onRefresh() {
    startTransition(async () => {
      const res = await refreshCustomerAnalytics();
      if (!res.ok) {
        notifyError("Không cập nhật được dữ liệu", res.error.message);
        return;
      }
      notifySuccess("Đã cập nhật dữ liệu phân tích", `${res.data.updated.toLocaleString("vi-VN")} khách`);
      router.refresh();
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={onRefresh} disabled={isPending}>
      {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
      {isPending ? "Đang cập nhật..." : "Cập nhật dữ liệu"}
    </Button>
  );
}
