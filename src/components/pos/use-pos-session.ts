"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createEmptySession,
  createFreshSession,
  inferStepFromSession,
  loadLastCustomer,
  maxStepReached,
  nextStep,
  prevStep,
  saveLastCustomer,
  sessionStorageKey,
  stepsForOrderType,
  type PosSessionData,
  type PosStep,
} from "@/lib/pos/session";

export function usePosSession(branchId: string, defaultOrderType: "dine_in" | "takeaway") {
  const [session, setSession] = useState<PosSessionData>(() => createEmptySession(defaultOrderType));
  const [hydrated, setHydrated] = useState(false);

  const steps = useMemo(() => stepsForOrderType(session.orderType), [session.orderType]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(sessionStorageKey(branchId));
      const last = loadLastCustomer(branchId);
      if (raw) {
        const parsed = JSON.parse(raw) as PosSessionData;
        setSession({
          ...parsed,
          customerPhone: parsed.customerPhone || last.customerPhone,
          customerName: parsed.customerName || last.customerName,
        });
      } else if (last.customerPhone || last.customerName) {
        setSession((current) => ({ ...current, ...last }));
      }
    } catch {
      // ignore corrupt storage
    }
    setHydrated(true);
  }, [branchId]);

  const persistLocal = useCallback(
    (next: PosSessionData) => {
      setSession(next);
      if (next.customerPhone || next.customerName) {
        saveLastCustomer(branchId, {
          customerPhone: next.customerPhone,
          customerName: next.customerName,
        });
      }
      try {
        window.localStorage.setItem(sessionStorageKey(branchId), JSON.stringify(next));
      } catch {
        // quota exceeded — session still in memory
      }
    },
    [branchId]
  );

  const replaceSession = useCallback(
    (next: PosSessionData) => {
      persistLocal(next);
    },
    [persistLocal]
  );

  const resetSession = useCallback(() => {
    const empty = createFreshSession(defaultOrderType, branchId);
    persistLocal(empty);
    return empty;
  }, [branchId, defaultOrderType, persistLocal]);

  const patchSession = useCallback(
    (patch: Partial<PosSessionData>) => {
      setSession((current) => {
        const next = { ...current, ...patch };
        if (patch.orderType && patch.orderType !== current.orderType) {
          const newSteps = stepsForOrderType(patch.orderType);
          if (!newSteps.includes(next.step)) next.step = "service";
          if (!newSteps.includes(next.maxStep)) next.maxStep = "service";
        }
        if ("customerPhone" in patch || "customerName" in patch) {
          saveLastCustomer(branchId, {
            customerPhone: next.customerPhone,
            customerName: next.customerName,
          });
        }
        try {
          window.localStorage.setItem(sessionStorageKey(branchId), JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [branchId]
  );

  const goToStep = useCallback(
    (step: PosStep) => {
      patchSession({
        step,
        maxStep: maxStepReached(steps, session.maxStep, step),
      });
    },
    [patchSession, session.maxStep, steps]
  );

  const goNext = useCallback(() => {
    setSession((current) => {
      const orderSteps = stepsForOrderType(current.orderType);
      const n = nextStep(orderSteps, current.step);
      if (!n) return current;
      const next = { ...current, step: n, maxStep: maxStepReached(orderSteps, current.maxStep, n) };
      try {
        window.localStorage.setItem(sessionStorageKey(branchId), JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }, [branchId]);

  const goBack = useCallback(() => {
    const orderSteps = stepsForOrderType(session.orderType);
    const p = prevStep(orderSteps, session.step);
    if (!p) return false;
    patchSession({ step: p });
    return true;
  }, [patchSession, session.orderType, session.step]);

  const clearStorage = useCallback(() => {
    window.localStorage.removeItem(sessionStorageKey(branchId));
  }, [branchId]);

  return {
    session,
    steps,
    hydrated,
    replaceSession,
    resetSession,
    patchSession,
    goToStep,
    goNext,
    goBack,
    clearStorage,
    inferStep: () => inferStepFromSession(session),
  };
}
