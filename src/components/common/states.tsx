import * as React from "react";
import { cn } from "@/lib/utils/format";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-md border border-dashed p-8 text-center", className)}>
      {icon ? <div className="mb-3 text-muted-foreground">{icon}</div> : null}
      <p className="text-sm font-medium">{title}</p>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingState({ label = "Đang tải..." }: { label?: string }) {
  return (
    <div className="flex items-center justify-center rounded-md border border-dashed p-8 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

export function ErrorState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-md border border-destructive/40 bg-destructive/5 p-8 text-center">
      <p className="text-sm font-medium text-destructive">Đã xảy ra lỗi</p>
      <p className="mt-1 text-sm text-muted-foreground">{message}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
