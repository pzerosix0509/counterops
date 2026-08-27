"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ShoppingCart,
  ChefHat,
  Table2,
  UtensilsCrossed,
  Boxes,
  FileBarChart,
  Settings,
  Sparkles,
  Bot,
} from "lucide-react";
import { cn } from "@/lib/utils/format";
import type { MembershipRole } from "@/types/database";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  allowed: MembershipRole[];
}

const ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard, allowed: ["owner", "admin", "manager", "cashier"] },
  { href: "/pos", label: "Bán hàng", icon: ShoppingCart, allowed: ["owner", "admin", "manager", "cashier", "reception"] },
  { href: "/kitchen", label: "Bếp", icon: ChefHat, allowed: ["owner", "admin", "manager", "kitchen"] },
  { href: "/tables", label: "Bàn / phòng", icon: Table2, allowed: ["owner", "admin", "manager", "cashier", "reception"] },
  { href: "/menu", label: "Thực đơn", icon: UtensilsCrossed, allowed: ["owner", "admin", "manager", "cashier", "reception", "kitchen"] },
  { href: "/inventory", label: "Kho hàng", icon: Boxes, allowed: ["owner", "admin", "manager", "cashier"] },
  { href: "/analytics", label: "Phân tích", icon: Sparkles, allowed: ["owner", "admin", "manager", "cashier"] },
  { href: "/reports", label: "Báo cáo", icon: FileBarChart, allowed: ["owner", "admin", "manager", "cashier"] },
  { href: "/ai", label: "AI trợ lý", icon: Bot, allowed: ["owner", "admin", "manager", "cashier"] },
  { href: "/settings", label: "Cài đặt", icon: Settings, allowed: ["owner", "admin", "manager"] },
];

export function Sidebar({ role, organizationName }: { role: MembershipRole; organizationName: string }) {
  const pathname = usePathname();
  const items = ITEMS.filter((it) => it.allowed.includes(role));
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] border-r bg-background md:flex md:flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/dashboard" className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Quản lý cửa hàng</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary"
                  : "text-foreground/80 hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="border-t p-3 text-xs text-muted-foreground">
        <p className="truncate">{organizationName}</p>
      </div>
    </aside>
  );
}
