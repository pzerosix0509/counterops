"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PosFloorPlan } from "@/components/pos/pos-floor-plan";
import { PosOrderWizard } from "@/components/pos/pos-order-wizard";
import { PosTableSessionPanel } from "@/components/pos/pos-table-session-panel";
import { usePosSession } from "@/components/pos/use-pos-session";
import { useBranchRealtime } from "@/hooks/use-branch-realtime";
import { notifyError } from "@/hooks/use-notify";
import { createFreshSession, sessionFromOrder } from "@/lib/pos/session";
import { loadPosOrder } from "@/server/actions/orders";
import type { PosProduct } from "@/lib/pos/product";
import type { OperationalSettings } from "@/lib/settings/operational";
import type { PosTableOrderSummary } from "@/server/queries/orders";
import type { Area, DiningTable, MenuCategory, SalesChannel } from "@/types/database";

const OPEN_ORDER_STATUSES = new Set(["draft", "open", "sent_to_kitchen", "partially_paid"]);

type PosView = "floor" | "wizard" | "table-session";

interface Props {
  organizationId: string;
  branchId: string;
  canCreate: boolean;
  canPay: boolean;
  products: PosProduct[];
  categories: MenuCategory[];
  areas: Area[];
  tables: DiningTable[];
  channels: SalesChannel[];
  settings: OperationalSettings;
  activeOrders: PosTableOrderSummary[];
}

export function PosWorkspace(props: Props) {
  const router = useRouter();
  const { organizationId, branchId, products, categories, areas, tables, channels, canPay, canCreate, settings, activeOrders } = props;

  const [view, setView] = useState<PosView>("floor");
  const [serviceTable, setServiceTable] = useState<DiningTable | null>(null);
  const [serviceOrder, setServiceOrder] = useState<PosTableOrderSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  const {
    session,
    steps,
    hydrated,
    replaceSession,
    resetSession,
    patchSession,
    goNext,
    goBack,
    clearStorage,
  } = usePosSession(branchId, settings.defaultOrderType);

  const POS_REALTIME_TABLES = useMemo(
    () => [
      { name: "orders" as const, scopeByBranch: true },
      { name: "order_items" as const, scopeByBranch: true },
      { name: "dining_tables" as const, scopeByBranch: true },
    ],
    []
  );

  const realtime = useBranchRealtime({
    branchId,
    organizationId,
    tables: POS_REALTIME_TABLES,
    onChange: () => router.refresh(),
  });

  function openNewOrder() {
    const empty = resetSession();
    replaceSession(empty);
    setView("wizard");
  }

  function returnToFloor() {
    setView("floor");
    setServiceTable(null);
    setServiceOrder(null);
  }

  function handleOrderComplete() {
    clearStorage();
    resetSession();
    returnToFloor();
  }

  function resumeOpenOrder(orderId: string) {
    startTransition(async () => {
      const result = await loadPosOrder(organizationId, orderId);
      if (!result.ok) {
        notifyError("Không tải được đơn", result.error.message);
        return;
      }
      replaceSession(sessionFromOrder(result.data.order));
      setView("wizard");
    });
  }

  function continueOrderOnTable(table: DiningTable) {
    const openOrder = activeOrders.find(
      (order) => order.tableId === table.id && OPEN_ORDER_STATUSES.has(order.status)
    );
    if (openOrder) {
      setServiceTable(null);
      setServiceOrder(null);
      resumeOpenOrder(openOrder.orderId);
      return;
    }

    replaceSession(
      createFreshSession(settings.defaultOrderType, branchId, {
        orderType: "dine_in",
        tableId: table.id,
        step: "items",
        maxStep: "items",
        ...(serviceOrder?.customerPhone ? { customerPhone: serviceOrder.customerPhone } : {}),
        ...(serviceOrder?.customerName ? { customerName: serviceOrder.customerName } : {}),
      })
    );
    setServiceTable(null);
    setServiceOrder(null);
    setView("wizard");
  }

  useEffect(() => {
    if (view !== "wizard" || !hydrated || session.orderId || !session.tableId || session.orderType !== "dine_in") {
      return;
    }
    const openOrder = activeOrders.find(
      (order) => order.tableId === session.tableId && OPEN_ORDER_STATUSES.has(order.status)
    );
    if (!openOrder) return;
    resumeOpenOrder(openOrder.orderId);
  }, [view, hydrated, session.orderId, session.tableId, session.orderType, activeOrders, organizationId]);

  function handleTableClick(table: DiningTable, order?: PosTableOrderSummary) {
    if (table.status === "disabled") return;

    if (order?.status === "paid") {
      setServiceTable(table);
      setServiceOrder(order);
      setView("table-session");
      return;
    }

    if (order && OPEN_ORDER_STATUSES.has(order.status)) {
      resumeOpenOrder(order.orderId);
      return;
    }

    const base = createFreshSession(settings.defaultOrderType, branchId, {
      orderType: "dine_in",
      tableId: table.id,
      step: "table",
      maxStep: "table",
    });
    replaceSession(base);
    setView("wizard");
  }

  if (!hydrated) {
    return <p className="text-sm text-muted-foreground">Đang tải...</p>;
  }

  return (
    <div className="space-y-2">
      {realtime.isSubscribed ? (
        <p className="text-xs text-muted-foreground">
          {realtime.hasPendingChange ? "Đang đồng bộ..." : "Đã đồng bộ realtime"}
        </p>
      ) : null}

      {view === "floor" ? (
        <PosFloorPlan
          areas={areas}
          tables={tables}
          activeOrders={activeOrders}
          onNewOrder={openNewOrder}
          onTableClick={handleTableClick}
        />
      ) : null}

      {view === "wizard" ? (
        <PosOrderWizard
          organizationId={organizationId}
          branchId={branchId}
          canCreate={canCreate}
          canPay={canPay}
          session={session}
          steps={steps}
          products={products}
          categories={categories}
          areas={areas}
          tables={tables}
          channels={channels}
          settings={settings}
          activeOrders={activeOrders}
          onSessionChange={patchSession}
          onOrderId={(orderId) => patchSession({ orderId })}
          onResumeOpenOrder={resumeOpenOrder}
          onBack={returnToFloor}
          onGoNext={goNext}
          onGoBackStep={goBack}
          onComplete={handleOrderComplete}
        />
      ) : null}

      {view === "table-session" && serviceTable && serviceOrder ? (
        <PosTableSessionPanel
          organizationId={organizationId}
          table={serviceTable}
          order={serviceOrder}
          onBack={returnToFloor}
          onContinueOrder={() => continueOrderOnTable(serviceTable)}
          onComplete={handleOrderComplete}
        />
      ) : null}

      {isPending ? <p className="text-xs text-muted-foreground">Đang tải đơn...</p> : null}
    </div>
  );
}
