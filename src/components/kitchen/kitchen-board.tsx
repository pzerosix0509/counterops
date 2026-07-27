"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Hourglass } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/common/states";
import { formatTime } from "@/lib/utils/format";
import { updateKitchenStatus } from "@/server/actions/orders";
import { useBranchRealtime } from "@/hooks/use-branch-realtime";
import { notifyError, notifyInfo } from "@/hooks/use-notify";
import type { KitchenItem as KitchenItemType } from "@/server/queries/kitchen";

type KitchenTab = "pending" | "ready";

export function KitchenBoard({
  organizationId,
  branchId,
  items,
  canUpdate,
  soundEnabled,
  autoMarkServedOnReady,
}: {
  organizationId: string;
  branchId: string;
  items: KitchenItemType[];
  canUpdate: boolean;
  soundEnabled: boolean;
  autoMarkServedOnReady: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<KitchenTab>("pending");
  const [error, setError] = useState<string | null>(null);
  const [optimisticIds, setOptimisticIds] = useState<Record<string, "ready" | "served">>({});
  const seenItemIdsRef = useRef<Set<string> | null>(null);

  const realtime = useBranchRealtime({
    branchId,
    organizationId,
    onChange: () => router.refresh(),
  });

  useEffect(() => {
    const activeIds = new Set(
      items
        .filter((item) => item.item.kitchen_status === "pending" || item.item.kitchen_status === "cooking")
        .map((item) => item.item.id)
    );
    if (seenItemIdsRef.current === null) {
      seenItemIdsRef.current = activeIds;
      return;
    }
    const addedCount = Array.from(activeIds).filter((id) => !seenItemIdsRef.current?.has(id)).length;
    seenItemIdsRef.current = activeIds;
    if (addedCount > 0) {
      notifyInfo("Có món mới vào bếp", `${addedCount} món vừa được thanh toán.`);
      if (soundEnabled) playKitchenTone();
    }
  }, [items, soundEnabled]);

  const groups = useMemo(() => {
    const m = new Map<
      string,
      {
        orderNumber: string;
        tableName: string | null;
        orderType: KitchenItemType["orderType"];
        openedAt: string;
        paidAt: string | null;
        items: KitchenItemType[];
      }
    >();
    for (const it of items) {
      const key = it.item.order_id;
      const cur = m.get(key) ?? {
        orderNumber: it.orderNumber,
        tableName: it.tableName,
        orderType: it.orderType,
        openedAt: it.openedAt,
        paidAt: it.paidAt,
        items: [],
      };
      cur.items.push(it);
      m.set(key, cur);
    }
    return Array.from(m.entries()).map(([orderId, v]) => ({ orderId, ...v }));
  }, [items]);

  const filtered = useMemo(() => {
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter((it) =>
          tab === "pending"
            ? it.item.kitchen_status === "pending" || it.item.kitchen_status === "cooking"
            : it.item.kitchen_status === "ready"
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, tab]);

  function changeStatus(itemId: string, status: "ready" | "served") {
    if (!canUpdate) return;
    const nextStatus = status === "ready" && autoMarkServedOnReady ? "served" : status;
    setError(null);
    setOptimisticIds((prev) => ({ ...prev, [itemId]: nextStatus }));
    updateKitchenStatus(organizationId, itemId, { status: nextStatus }).then((result) => {
      if (!result.ok) {
        setOptimisticIds((prev) => {
          const copy = { ...prev };
          delete copy[itemId];
          return copy;
        });
        setError(result.error.message);
        notifyError("Không thể cập nhật trạng thái bếp", result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as KitchenTab)}>
        <TabsList>
          <TabsTrigger value="pending">
            <Hourglass className="h-3.5 w-3.5" /> Chờ chế biến
          </TabsTrigger>
          <TabsTrigger value="ready">
            <Check className="h-3.5 w-3.5" /> Sẵn sàng
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {error ? <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {realtime.isSubscribed && realtime.hasPendingChange ? <p className="text-xs text-muted-foreground">Đang đồng bộ...</p> : null}
      {!realtime.isSubscribed && realtime.error ? <p className="text-xs text-destructive">Mất kết nối realtime: {realtime.error}</p> : null}

      {filtered.length === 0 ? (
        <EmptyState
          title={tab === "pending" ? "Không có món chờ" : "Chưa có món sẵn sàng"}
          description="Các món đã thanh toán sẽ tự động xuất hiện ở đây."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((g) => (
            <Card key={g.orderId}>
              <CardHeader className="space-y-2 pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm">
                    {g.tableName ? `Bàn ${g.tableName}` : "Mang đi"} • {g.orderNumber}
                  </CardTitle>
                  <Badge variant="success" className="shrink-0">Đã thanh toán</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>{g.orderType === "dine_in" ? "Tại quán" : "Mang đi"}</span>
                  <span>Thanh toán lúc {formatTime(g.paidAt ?? g.openedAt)}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {g.items.map((it) => (
                  <div key={it.item.id} className="rounded-md border p-2 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium">{it.item.product_name_snapshot} x {Number(it.item.quantity)}</p>
                        {it.item.note ? <p className="text-xs italic text-muted-foreground">{it.item.note}</p> : null}
                      </div>
                      <span className="text-xs text-muted-foreground">{formatTime(it.item.created_at)}</span>
                    </div>
                    {canUpdate ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {tab === "pending" ? (
                          <Button size="sm" disabled={!!optimisticIds[it.item.id]} onClick={() => changeStatus(it.item.id, "ready")}>
                            <Check className="h-3.5 w-3.5" /> {optimisticIds[it.item.id] ? "Đã gửi..." : "Sẵn sàng"}
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled={!!optimisticIds[it.item.id]} onClick={() => changeStatus(it.item.id, "served")}>
                            {optimisticIds[it.item.id] ? "Đã gửi..." : "Đã phục vụ"}
                          </Button>
                        )}
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

function playKitchenTone() {
  try {
    const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.24);
    window.setTimeout(() => void ctx.close(), 350);
  } catch {
    // Browsers may block audio until the first user gesture. Toast still provides visual feedback.
  }
}
