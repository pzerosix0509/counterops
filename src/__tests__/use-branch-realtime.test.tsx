// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";

type ChannelHandler = (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;

const subscribeCallbacks = new Map<RealtimeChannel, (status: string) => void>();
const removeChannel = vi.fn();
const channelInstances: RealtimeChannel[] = [];
const postgresSubscriptions: { config: { table?: string; filter?: string } }[] = [];

const mockChannel = {
  on(event: string, config: { table?: string; filter?: string }, handler: ChannelHandler) {
    if (event === "postgres_changes") {
      postgresSubscriptions.push({ config });
      (this as unknown as { __handler: ChannelHandler }).__handler = handler;
    }
    return this;
  },
  subscribe(cb: (status: string) => void) {
    subscribeCallbacks.set(this as unknown as RealtimeChannel, cb);
    return this;
  },
};

vi.mock("@/lib/supabase/client", () => ({
  createSupabaseBrowserClient: () => ({
    channel: (name: string) => {
      const c = { name, ...mockChannel };
      channelInstances.push(c as unknown as RealtimeChannel);
      return c;
    },
    removeChannel: (ch: RealtimeChannel) => removeChannel(ch),
  }),
}));

import { useBranchRealtime } from "@/hooks/use-branch-realtime";

function firePostgresChange(ch: RealtimeChannel, type: "INSERT" | "UPDATE" | "DELETE") {
  const handler = (ch as unknown as { __handler?: ChannelHandler }).__handler;
  if (!handler) throw new Error("handler not registered");
  act(() => {
    handler({ eventType: type, new: {}, old: {}, schema: "public", table: "orders", commit_timestamp: "" } as never);
  });
}

function flushSubscribed() {
  subscribeCallbacks.forEach((cb) => act(() => cb("SUBSCRIBED")));
}

describe("useBranchRealtime", () => {
  beforeEach(() => {
    subscribeCallbacks.clear();
    channelInstances.length = 0;
    postgresSubscriptions.length = 0;
    removeChannel.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("subscribes to the configured tables scoped by branch_id", async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useBranchRealtime({ branchId: "branch-1", organizationId: "org-1", debounceMs: 0, onChange: vi.fn() })
    );
    flushSubscribed();
    expect(result.current.isSubscribed).toBe(true);
    expect(channelInstances.length).toBe(1);
    expect(postgresSubscriptions.map((sub) => sub.config.table)).toEqual(["orders", "order_items", "dining_tables", "inventory_balances"]);
    expect(postgresSubscriptions.every((sub) => sub.config.filter === "branch_id=eq.branch-1")).toBe(true);
  });

  it("can subscribe with organization_id scope when branch scope is not requested", () => {
    renderHook(() =>
      useBranchRealtime({
        branchId: "branch-1",
        organizationId: "org-1",
        tables: [{ name: "orders", scopeByOrg: true }],
        onChange: vi.fn(),
      })
    );
    expect(postgresSubscriptions).toHaveLength(1);
    expect(postgresSubscriptions[0].config.filter).toBe("organization_id=eq.org-1");
  });

  it("does not subscribe when branchId is missing", () => {
    const { result } = renderHook(() => useBranchRealtime({ branchId: null, onChange: vi.fn() }));
    expect(channelInstances.length).toBe(0);
    expect(result.current.isSubscribed).toBe(false);
  });

  it("does not subscribe when disabled", () => {
    renderHook(() => useBranchRealtime({ branchId: "branch-1", enabled: false, onChange: vi.fn() }));
    expect(channelInstances.length).toBe(0);
  });

  it("debounces bursts of events into a single onChange call", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const { result } = renderHook(() => useBranchRealtime({ branchId: "branch-1", debounceMs: 200, onChange }));
    flushSubscribed();

    const ch = channelInstances[0];
    firePostgresChange(ch, "INSERT");
    firePostgresChange(ch, "UPDATE");
    firePostgresChange(ch, "DELETE");
    expect(onChange).not.toHaveBeenCalled();
    expect(result.current.hasPendingChange).toBe(true);

    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(result.current.hasPendingChange).toBe(false);
  });

  it("removes the channel on unmount", () => {
    const { unmount } = renderHook(() => useBranchRealtime({ branchId: "branch-1", onChange: vi.fn() }));
    flushSubscribed();
    const ch = channelInstances[0];
    unmount();
    expect(removeChannel).toHaveBeenCalledWith(ch);
  });
});
