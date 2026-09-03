"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  ChefHat,
  Table2,
  UtensilsCrossed,
  Boxes,
  FileBarChart,
  Settings,
  Users,
  Sparkles,
  Bot,
  CalendarDays,
  ClipboardList,
  UserCheck,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils/format";
import type { MembershipRole } from "@/types/database";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  allowed: MembershipRole[];
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: (NavItem | NavGroup)[] = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard, allowed: ["owner", "admin", "manager"] },
  { href: "/pos", label: "Bán hàng", icon: ShoppingCart, allowed: ["owner", "admin", "manager", "cashier", "reception", "staff"] },
  { href: "/kitchen", label: "Bếp", icon: ChefHat, allowed: ["owner", "admin", "manager", "kitchen"] },
  { href: "/tables", label: "Bàn / phòng", icon: Table2, allowed: ["owner", "admin", "manager", "cashier", "reception"] },
  { href: "/menu", label: "Thực đơn", icon: UtensilsCrossed, allowed: ["owner", "admin", "manager", "cashier", "reception", "kitchen"] },
  {
    label: "Nhân sự",
    items: [
      { href: "/employees", label: "Nhân viên", icon: Users, allowed: ["owner", "admin", "manager"] },
      { href: "/schedules", label: "Ca làm việc", icon: CalendarDays, allowed: ["owner", "admin", "manager"] },
      { href: "/attendance", label: "Chấm công", icon: ClipboardList, allowed: ["owner", "admin", "manager"] },
      { href: "/my-attendance", label: "Chấm công của tôi", icon: UserCheck, allowed: ["owner", "admin", "manager", "cashier", "reception", "kitchen", "staff"] },
    ]
  },
  { href: "/inventory", label: "Kho hàng", icon: Boxes, allowed: ["owner", "admin", "manager"] },
  { href: "/analytics", label: "Phân tích", icon: Sparkles, allowed: ["owner", "admin", "manager"] },
  { href: "/reports", label: "Báo cáo", icon: FileBarChart, allowed: ["owner", "admin", "manager"] },
  { href: "/ai", label: "AI trợ lý", icon: Bot, allowed: ["owner", "admin", "manager"] },
  { href: "/settings", label: "Cài đặt", icon: Settings, allowed: ["owner", "admin", "manager"] },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = pathname === item.href || pathname.startsWith(item.href + "/");
  const Icon = item.icon;
  return (
    <Link
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
}

function CollapsibleNavGroup({ group, role, pathname }: { group: NavGroup; role: MembershipRole; pathname: string }) {
  const [open, setOpen] = useState(true);
  const items = group.items.filter((it) => it.allowed.includes(role));
  
  if (items.length === 0) return null;

  return (
    <div className="space-y-1">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <span>{group.label}</span>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="space-y-1 pl-2">
          {items.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ role, organizationName }: { role: MembershipRole; organizationName: string }) {
  const pathname = usePathname();
  const homeHref = role === "staff" ? "/pos" : "/dashboard";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[240px] border-r bg-background md:flex md:flex-col">
      <div className="flex h-14 items-center border-b px-4">
        <Link href={homeHref} className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Quản lý cửa hàng</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {NAV_GROUPS.map((itemOrGroup, idx) => {
          if ("items" in itemOrGroup) {
            return <CollapsibleNavGroup key={idx} group={itemOrGroup} role={role} pathname={pathname} />;
          } else {
            if (!itemOrGroup.allowed.includes(role)) return null;
            return <NavLink key={itemOrGroup.href} item={itemOrGroup} pathname={pathname} />;
          }
        })}
      </nav>
      <div className="border-t p-3 text-xs text-muted-foreground">
        <p className="truncate">{organizationName}</p>
      </div>
    </aside>
  );
}