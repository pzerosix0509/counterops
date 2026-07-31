"use client";
import { useState, useTransition, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/states";
import { formatVND } from "@/lib/date/ranges";
import { createArea, createTable, updateTableStatus } from "@/server/actions/tables";
import { cn } from "@/lib/utils/format";
import type { Area, DiningTable, Order, TableStatus } from "@/types/database";

const STATUS_LABEL: Record<TableStatus, string> = {
  available: "Trống",
  occupied: "Đang dùng",
  reserved: "Đã đặt",
  disabled: "Tạm khoá",
};

const STATUS_VARIANT: Record<TableStatus, "success" | "warning" | "info" | "outline"> = {
  available: "success",
  occupied: "warning",
  reserved: "info",
  disabled: "outline",
};

const STATUS_TONE: Record<TableStatus, string> = {
  available: "border-emerald-200 bg-emerald-50",
  occupied: "border-amber-300 bg-amber-50",
  reserved: "border-sky-300 bg-sky-50",
  disabled: "border-slate-200 bg-slate-50 opacity-70",
};

export function TablesManager({
  organizationId,
  branchId,
  canManage,
  areas,
  tables,
  openByTable,
}: {
  organizationId: string;
  branchId: string;
  canManage: boolean;
  areas: Area[];
  tables: DiningTable[];
  openByTable: Record<string, Order>;
}) {
  const router = useRouter();
  const [openTable, setOpenTable] = useState(false);
  const [openArea, setOpenArea] = useState(false);
  const [areaError, setAreaError] = useState<string | null>(null);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, TableStatus>>({});

  // Clear overrides once the DB value has caught up with what we set
  useEffect(() => {
    setStatusOverrides((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const t of tables) {
        if (next[t.id] !== undefined && next[t.id] === t.status) {
          delete next[t.id];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [tables]);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [activeArea, setActiveArea] = useState<string>("all");

  function onCreateArea(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAreaError(null);
    const f = new FormData(e.currentTarget);
    const name = String(f.get("name") || "").trim();
    if (!name) {
      setAreaError("Vui lòng nhập tên khu vực");
      return;
    }
    startTransition(async () => {
      const res = await createArea(organizationId, branchId, { name, sortOrder: areas.length });
      if (!res.ok) {
        setAreaError(res.error.message);
        return;
      }
      setOpenArea(false);
      router.refresh();
    });
  }

  function onCreateTable(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const payload = {
      branchId,
      areaId: (f.get("areaId") as string) || null,
      name: String(f.get("name") || ""),
      seats: Number(f.get("seats") || 2),
      sortOrder: tables.length,
    };
    startTransition(async () => {
      const res = await createTable(organizationId, payload);
      if (!res.ok) {
        setError(res.error.message);
        return;
      }
      setOpenTable(false);
      router.refresh();
    });
  }

  function onStatusChange(tableId: string, status: TableStatus) {
    setStatusOverrides((prev) => ({ ...prev, [tableId]: status }));
    startTransition(async () => {
      const res = await updateTableStatus(organizationId, { tableId, status });
      if (res.ok) {
        router.refresh();
      } else {
        setStatusOverrides((prev) => {
          const next = { ...prev };
          delete next[tableId];
          return next;
        });
      }
    });
  }

  const filtered = useMemo(() => {
    if (activeArea === "all") return tables;
    return tables.filter((t) => t.area_id === activeArea);
  }, [tables, activeArea]);

  const grouped = useMemo(() => {
    const m = new Map<string | null, DiningTable[]>();
    for (const t of filtered) {
      const key = t.area_id ?? null;
      const arr = m.get(key) ?? [];
      arr.push(t);
      m.set(key, arr);
    }
    return Array.from(m.entries()).map(([k, v]) => ({ area: areas.find((a) => a.id === k) ?? null, tables: v }));
  }, [filtered, areas]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            size="sm"
            variant={activeArea === "all" ? "default" : "outline"}
            onClick={() => setActiveArea("all")}
          >
            Tất cả
          </Button>
          {areas.map((a) => (
            <Button
              key={a.id}
              size="sm"
              variant={activeArea === a.id ? "default" : "outline"}
              onClick={() => setActiveArea(a.id)}
            >
              {a.name}
            </Button>
          ))}
        </div>
        {canManage ? (
          <div className="flex items-center gap-2">
            <Dialog open={openArea} onOpenChange={setOpenArea}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Plus className="h-4 w-4" /> Khu vực
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Thêm khu vực mới</DialogTitle>
                  <DialogDescription>Ví dụ: Lầu 1, Sân vườn, Tầng trệt...</DialogDescription>
                </DialogHeader>
                <form className="space-y-3" onSubmit={onCreateArea}>
                  <div className="space-y-1.5">
                    <Label htmlFor="areaName">Tên khu vực</Label>
                    <Input id="areaName" name="name" required placeholder="Lầu 1, Sân vườn..." />
                  </div>
                  {areaError ? <p className="text-sm text-destructive">{areaError}</p> : null}
                  <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => setOpenArea(false)}>Huỷ</Button>
                    <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : "Lưu"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
            <Dialog open={openTable} onOpenChange={setOpenTable}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4" /> Thêm bàn
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Thêm bàn mới</DialogTitle>
                  <DialogDescription>Tên bàn là duy nhất trong chi nhánh.</DialogDescription>
                </DialogHeader>
                <form className="space-y-3" onSubmit={onCreateTable}>
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Tên bàn</Label>
                    <Input id="name" name="name" required placeholder="A1, B2..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="areaId">Khu vực</Label>
                    <Select name="areaId" defaultValue={areas[0]?.id ?? ""}>
                      <SelectTrigger><SelectValue placeholder="Chọn khu vực" /></SelectTrigger>
                      <SelectContent>
                        {areas.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="seats">Số ghế</Label>
                    <Input id="seats" name="seats" type="number" min="1" defaultValue={2} required />
                  </div>
                  {error ? <p className="text-sm text-destructive">{error}</p> : null}
                  <DialogFooter>
                    <Button type="button" variant="ghost" onClick={() => setOpenTable(false)}>Huỷ</Button>
                    <Button type="submit" disabled={isPending}>{isPending ? "Đang lưu..." : "Lưu"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        ) : null}
      </div>

      {tables.length === 0 ? (
        <EmptyState title="Chưa có bàn nào" description="Tạo khu vực và bàn để bắt đầu phục vụ." />
      ) : (
        <div className="space-y-4">
          {grouped.map((g) => (
            <Card key={g.area?.id ?? "none"}>
              <CardHeader>
                <CardTitle className="text-sm">{g.area?.name ?? "Chưa phân khu vực"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                  {g.tables.map((t) => {
                    const open = openByTable[t.id];
                    const derivedStatus: TableStatus = statusOverrides[t.id] ?? t.status;
                    return (
                      <div
                        key={t.id}
                        className={cn(
                          "rounded-md border p-3 text-sm shadow-sm",
                          STATUS_TONE[derivedStatus]
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold">{t.name}</span>
                          <Badge variant={STATUS_VARIANT[derivedStatus]}>{STATUS_LABEL[derivedStatus]}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <Users className="mr-1 inline h-3 w-3" /> {t.seats} ghế
                        </p>
                        {open ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Đơn: {open.order_number} • {formatVND(open.total_amount)}
                          </p>
                        ) : null}
                        {canManage ? (
                          <Select
                            value={derivedStatus}
                            onValueChange={(v) => onStatusChange(t.id, v as TableStatus)}
                          >
                            <SelectTrigger className="mt-2 h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="available">Trống</SelectItem>
                              <SelectItem value="occupied">Đang dùng</SelectItem>
                              <SelectItem value="reserved">Đã đặt</SelectItem>
                              <SelectItem value="disabled">Tạm khoá</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
