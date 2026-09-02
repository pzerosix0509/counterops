"use client";

import { Users, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/format";
import { formatVND } from "@/lib/date/ranges";
import { STATUS_LABEL, STATUS_TONE, STATUS_VARIANT } from "@/lib/pos/table-status";
import type { PosTableOrderSummary } from "@/server/queries/orders";
import type { DiningTable } from "@/types/database";

function formatElapsed(openedAt: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(openedAt).getTime()) / 60000));
  if (mins < 60) return `${mins} phút`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hours}g ${rem}p` : `${hours} giờ`;
}

export function PosTableCard({
  table,
  order,
  onClick,
}: {
  table: DiningTable;
  order?: PosTableOrderSummary;
  onClick: () => void;
}) {
  const status = table.status;
  const isPaid = order?.status === "paid";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={status === "disabled"}
      className={cn(
        "rounded-md border p-3 text-left text-sm shadow-sm transition hover:ring-2 hover:ring-primary/30",
        STATUS_TONE[status],
        status === "disabled" && "cursor-not-allowed opacity-60"
      )}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="font-semibold">{table.name}</span>
        <Badge variant={STATUS_VARIANT[status]} className="shrink-0 text-[10px]">
          {STATUS_LABEL[status]}
        </Badge>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        <Users className="mr-1 inline h-3 w-3" />
        {table.seats} ghế
      </p>
      {order ? (
        <div className="mt-2 space-y-1 border-t border-black/5 pt-2 text-xs">
          <div className="flex items-center justify-between gap-1">
            <span className="font-medium">{order.orderNumber}</span>
            <Badge variant={isPaid ? "success" : "warning"} className="text-[10px]">
              {isPaid ? "Đã TT" : "Chưa TT"}
            </Badge>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>{order.itemCount} món</span>
            <span className="font-semibold text-foreground">{formatVND(order.totalAmount)}</span>
          </div>
          <p className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3 w-3" />
            {formatElapsed(order.openedAt)}
          </p>
        </div>
      ) : null}
    </button>
  );
}
