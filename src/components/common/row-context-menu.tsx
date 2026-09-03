"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/format";

export interface ContextMenuItem {
  key: string;
  label: string;
  icon?: LucideIcon;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

type RowElement = "div" | "tr";

/**
 * Lớp phủ (wrapper) cho phép bấm chuột phải vào hàng để mở menu
 * hành động: Công thức, Chỉnh sửa, Xóa.
 *
 * `as` cho phép render thành <div> hoặc <tr> để dùng trong bảng.
 */
export function RowContextMenu({
  as = "div",
  items,
  children,
  className,
}: {
  as?: RowElement;
  items: ContextMenuItem[];
  children: React.ReactNode;
  className?: string;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const wrapRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setMenu(null), []);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [menu, close]);

  function handleContextMenu(e: React.MouseEvent<HTMLElement>) {
    e.preventDefault();
    if (items.length === 0) return;
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.min(e.clientX, rect.right - 180);
    const y = Math.min(e.clientY, rect.bottom - 130);
    setMenu({ x, y });
  }

  const childrenWithMenu = (
    <>
      {children}
      {menu && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[100] min-w-44 rounded-md border bg-background p-1 shadow-lg"
              style={{ left: menu.x, top: menu.y, width: 176 }}
              role="menu"
              onContextMenu={(e) => e.preventDefault()}
            >
              {items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={() => {
                      close();
                      item.onClick();
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
                      item.destructive && "text-destructive hover:bg-destructive/10 hover:text-destructive"
                    )}
                    data-disabled={item.disabled || undefined}
                  >
                    {Icon ? <Icon className="h-4 w-4" /> : null}
                    {item.label}
                  </button>
                );
              })}
            </div>,
            document.body
          )
        : null}
    </>
  );

  if (as === "tr") {
    return (
      <tr
        ref={wrapRef as React.Ref<HTMLTableRowElement>}
        className={cn("cursor-context-menu border-b transition-colors hover:bg-muted/50", className)}
        onContextMenu={handleContextMenu}
      >
        {childrenWithMenu}
      </tr>
    );
  }

  return (
    <div ref={wrapRef as React.Ref<HTMLDivElement>} className={cn("cursor-context-menu", className)} onContextMenu={handleContextMenu}>
      {childrenWithMenu}
    </div>
  );
}
