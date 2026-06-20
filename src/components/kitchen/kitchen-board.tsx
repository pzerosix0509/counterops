"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Flame, Hourglass } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/states";
import { formatTime } from "@/lib/utils/format";
import { updateKitchenStatus } from "@/server/actions/orders";
import type { KitchenItem as KitchenItemType } from "@/server/queries/kitchen";

export function KitchenBoard({
  organizationId,
  items,
  canUpdate,
}: {
  organizationId: string;
  items: KitchenItemType[];
  canUpdate: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"pending" | "cooking" | "ready">("pending");
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(() => {
    const m = new Map<string, { orderNumber: string; tableName: string | null; openedAt: string; items: KitchenItemType[] }>();
    for (const it of items) {
      const key = it.item.order_id;
      const cur = m.get(key) ?? { orderNumber: it.orderNumber, tableName: it.tableName, openedAt: it.openedAt, items: [] };
      cur.items.push(it);
      m.set(key, cur);
    }
    return Array.from(m.entries()).map(([orderId, v]) => ({ orderId, ...v }));
  }, [items]);

  const filtered = useMemo(() => {
    return groups
      .map((g) => ({ ...g, items: g.items.filter((it) => it.item.kitchen_status === tab) }))
      .filter((g) => g.items.length > 0);
  }, [groups, tab]);

  function changeStatus(itemId: string, status: "cooking" | "ready" | "served") {
    if (!canUpdate) return;
    setError(null);
    setBusyId(itemId);
    startTransition(async () => {
      const result = await updateKitchenStatus(organizationId, itemId, { status });
      if (!result.ok) {
        setError(result.error.message);
        setBusyId(null);
        return;
      }
      setBusyId(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
        <TabsList>
          <TabsTrigger value="pending">
            <Hourglass className="h-3.5 w-3.5" /> Chờ chế biến
          </TabsTrigger>
          <TabsTrigger value="cooking">
            <Flame className="h-3.5 w-3.5" /> Đang làm
          </TabsTrigger>
          <TabsTrigger value="ready">
            <Check className="h-3.5 w-3.5" /> Đã xong
          </TabsTrigger>
        </TabsList>
      </Tabs>
      {error ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}

      {filtered.length === 0 ? (
        <EmptyState
          title={tab === "pending" ? "Không có món chờ" : tab === "cooking" ? "Chưa có món đang làm" : "Chưa có món sẵn sàng"}
          description="Các món mới sẽ tự động xuất hiện ở đây."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((g) => (
            <Card key={g.orderId}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {g.tableName ? `Bàn ${g.tableName}` : "Mang đi"} • {g.orderNumber}
                </CardTitle>
                <p className="text-xs text-muted-foreground">Mở lúc {formatTime(g.openedAt)}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {g.items.map((it) => (
                  <div key={it.item.id} className="rounded-md border p-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{it.item.product_name_snapshot} × {Number(it.item.quantity)}</p>
                        {it.item.note ? <p className="text-xs italic text-muted-foreground">{it.item.note}</p> : null}
                      </div>
                      <span className="text-xs text-muted-foreground">{formatTime(it.openedAt)}</span>
                    </div>
                    {canUpdate ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {tab === "pending" ? (
                          <>
                            <Button size="sm" disabled={busyId === it.item.id || isPending} onClick={() => changeStatus(it.item.id, "cooking")}>
                              <Flame className="h-3.5 w-3.5" /> Bắt đầu
                            </Button>
                            <Button size="sm" variant="outline" disabled={busyId === it.item.id || isPending} onClick={() => changeStatus(it.item.id, "ready")}>
                              <Check className="h-3.5 w-3.5" /> Sẵn sàng
                            </Button>
                          </>
                        ) : null}
                        {tab === "cooking" ? (
                          <Button size="sm" disabled={busyId === it.item.id || isPending} onClick={() => changeStatus(it.item.id, "ready")}>
                            <Check className="h-3.5 w-3.5" /> Sẵn sàng
                          </Button>
                        ) : null}
                        {tab === "ready" ? (
                          <Button size="sm" variant="outline" disabled={busyId === it.item.id || isPending} onClick={() => changeStatus(it.item.id, "served")}>
                            Đã phục vụ
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
