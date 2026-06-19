"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ChevronDown, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { MembershipRole } from "@/types/database";

interface TopbarProps {
  userEmail: string;
  userName: string | null;
  organizationName: string;
  branches: { id: string; name: string }[];
  currentBranchId: string | null;
  role: MembershipRole;
}

const ROLE_LABEL: Record<MembershipRole, string> = {
  owner: "Chủ sở hữu",
  admin: "Quản trị viên",
  manager: "Quản lý",
  cashier: "Thu ngân",
  reception: "Lễ tân",
  kitchen: "Bếp",
  staff: "Nhân viên",
};

export function Topbar({ userEmail, userName, organizationName, branches, currentBranchId, role }: TopbarProps) {
  const router = useRouter();

  const supabase = createSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function onBranchChange(value: string) {
    document.cookie = `active_branch=${value}; path=/; max-age=2592000; samesite=lax`;
    router.refresh();
  }

  async function onSignOut() {
    startTransition(async () => {
      await supabase.auth.signOut();
      router.replace("/login");
      router.refresh();
    });
  }

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-2 border-b bg-background px-4">
      <div className="flex items-center gap-2 text-sm">
        <Store className="h-4 w-4 text-muted-foreground" />
        <span className="font-semibold">{organizationName}</span>
        {branches.length > 0 ? (
          <Select value={currentBranchId ?? branches[0].id} onValueChange={onBranchChange}>
            <SelectTrigger className="ml-2 h-8 w-48 text-xs">
              <SelectValue placeholder="Chọn chi nhánh" />
            </SelectTrigger>
            <SelectContent>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : null}
        <span className="ml-2 hidden rounded bg-muted px-2 py-0.5 text-xs text-muted-foreground md:inline">
          {ROLE_LABEL[role]}
        </span>
      </div>
      <div className="relative">
        <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)}>
          <span className="max-w-[180px] truncate">{userName || userEmail || "Tài khoản"}</span>
          <ChevronDown className="h-3.5 w-3.5" />
        </Button>
        {open ? (
          <div
            className="absolute right-0 mt-1 w-56 rounded-md border bg-popover p-1 text-sm shadow-md"
            onMouseLeave={() => setOpen(false)}
          >
            <div className="px-2 py-1.5 text-xs text-muted-foreground">{userEmail}</div>
            <button
              className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
              onClick={onSignOut}
              disabled={isPending}
            >
              <LogOut className="h-3.5 w-3.5" />
              Đăng xuất
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
