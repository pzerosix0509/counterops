"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/states";
import { PosTableCard } from "@/components/pos/pos-table-card";
import type { PosTableOrderSummary } from "@/server/queries/orders";
import type { Area, DiningTable } from "@/types/database";

export function PosFloorPlan({
  areas,
  tables,
  activeOrders,
  onNewTakeawayOrder,
  onTableClick,
}: {
  areas: Area[];
  tables: DiningTable[];
  activeOrders: PosTableOrderSummary[];
  onNewTakeawayOrder: () => void;
  onTableClick: (table: DiningTable, order?: PosTableOrderSummary) => void;
}) {
  const [activeArea, setActiveArea] = useState<string>("all");

  const orderByTable = useMemo(() => {
    const map = new Map<string, PosTableOrderSummary>();
    for (const order of activeOrders) map.set(order.tableId, order);
    return map;
  }, [activeOrders]);

  const filtered = useMemo(() => {
    if (activeArea === "all") return tables;
    return tables.filter((t) => t.area_id === activeArea);
  }, [tables, activeArea]);

  const grouped = useMemo(() => {
    const map = new Map<string | null, DiningTable[]>();
    for (const table of filtered) {
      const key = table.area_id ?? null;
      const list = map.get(key) ?? [];
      list.push(table);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([areaId, areaTables]) => ({
      area: areas.find((a) => a.id === areaId) ?? null,
      tables: areaTables,
    }));
  }, [filtered, areas]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-1">
          <Button size="sm" variant={activeArea === "all" ? "default" : "outline"} onClick={() => setActiveArea("all")}>
            Tất cả
          </Button>
          {areas.map((area) => (
            <Button
              key={area.id}
              size="sm"
              variant={activeArea === area.id ? "default" : "outline"}
              onClick={() => setActiveArea(area.id)}
            >
              {area.name}
            </Button>
          ))}
        </div>
        <Button onClick={onNewTakeawayOrder}>
          <Plus className="h-4 w-4" />
          Tạo đơn mang đi
        </Button>
      </div>

      {tables.length === 0 ? (
        <EmptyState title="Chưa có bàn nào" description="Vào mục Bàn để tạo khu vực và bàn phục vụ." />
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <Card key={group.area?.id ?? "none"}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{group.area?.name ?? "Chưa phân khu vực"}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                  {group.tables.map((table) => {
                    const order = table.status === "occupied" ? orderByTable.get(table.id) : undefined;
                    return (
                      <PosTableCard
                        key={table.id}
                        table={table}
                        order={order}
                        onClick={() => onTableClick(table, order)}
                      />
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
