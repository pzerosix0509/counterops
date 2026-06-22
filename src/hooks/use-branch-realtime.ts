"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

export type BranchRealtimeTable = {
  name: "orders" | "order_items" | "dining_tables" | "inventory_balances";
  scopeByBranch?: boolean;
  scopeByOrg?: boolean;
};

export interface BranchRealtimeOptions {
  branchId: string | null | undefined;
  organizationId?: string | null;
  tables?: BranchRealtimeTable[];
  onEvent?: (event: { table: string; type: "INSERT" | "UPDATE" | "DELETE" }) => void;
  onChange?: () => void;
  debounceMs?: number;
  enabled?: boolean;
}

export interface BranchRealtimeState {
  isSubscribed: boolean;
  lastEventAt: number | null;
  hasPendingChange: boolean;
  error: string | null;
}

const DEFAULT_TABLES: BranchRealtimeTable[] = [
  { name: "orders", scopeByBranch: true },
  { name: "order_items", scopeByBranch: true },
  { name: "dining_tables", scopeByBranch: true },
  { name: "inventory_balances", scopeByBranch: true },
];

export function useBranchRealtime(options: BranchRealtimeOptions): BranchRealtimeState {
  const {
    branchId,
    organizationId,
    tables = DEFAULT_TABLES,
    onEvent,
    onChange,
    debounceMs = 600,
    enabled = true,
  } = options;

  const [state, setState] = useState<BranchRealtimeState>({
    isSubscribed: false,
    lastEventAt: null,
    hasPendingChange: false,
    error: null,
  });

  const onEventRef = useRef(onEvent);
  const onChangeRef = useRef(onChange);
  onEventRef.current = onEvent;
  onChangeRef.current = onChange;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled) return;
    if (!branchId) return;
    if (tables.length === 0) return;

    const supabase = createSupabaseBrowserClient();
    const channelName = "branch-" + branchId + "-" + Date.now();
    const channel: RealtimeChannel = supabase.channel(channelName);

    for (const table of tables) {
      const filter =
        table.scopeByBranch && branchId
          ? "branch_id=eq." + branchId
          : table.scopeByOrg && organizationId
            ? "organization_id=eq." + organizationId
            : undefined;

      const onChangeHandler = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
        const eventType = payload.eventType as "INSERT" | "UPDATE" | "DELETE";
        onEventRef.current?.({ table: table.name, type: eventType });
        setState((prev) => ({ ...prev, lastEventAt: Date.now(), hasPendingChange: true }));

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
          onChangeRef.current?.();
          setState((prev) => ({ ...prev, hasPendingChange: false }));
        }, debounceMs);
      };

      channel.on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table: table.name, ...(filter ? { filter } : {}) },
        onChangeHandler as never
      );
    }

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setState((prev) => ({ ...prev, isSubscribed: true, error: null }));
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        setState((prev) => ({ ...prev, isSubscribed: false, error: "Realtime: " + status }));
      }
    });

    cleanupRef.current = () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      supabase.removeChannel(channel);
    };

    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
      setState({ isSubscribed: false, lastEventAt: null, hasPendingChange: false, error: null });
    };
  }, [branchId, organizationId, tables, debounceMs, enabled]);

  return state;
}
