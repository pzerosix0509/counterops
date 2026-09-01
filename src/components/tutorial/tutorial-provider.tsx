"use client";
import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { TutorialOverlay } from "./tutorial-overlay";
import { TUTORIAL_STEPS } from "@/lib/tutorial-steps";

const STORAGE_KEY = "counterops:tutorial-completed";

interface TutorialContextValue {
  isActive: boolean;
  hasCompleted: boolean;
  startTutorial: () => void;
  skipTutorial: () => void;
  finishTutorial: () => void;
  nextStep: () => void;
  restart: () => void;
}

const TutorialContext = React.createContext<TutorialContextValue | null>(null);

function readStorage(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true;
  }
}

export function TutorialProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [hasCompleted, setHasCompleted] = React.useState<boolean>(() => readStorage());
  const [isActive, setIsActive] = React.useState(false);
  const [stepIndex, setStepIndex] = React.useState(0);
  const [visibleStep, setVisibleStep] = React.useState(-1);
  const [pendingRoute, setPendingRoute] = React.useState<string | null>(null);

  // When a step has a target route, wait for that route to mount before showing the highlight.
  React.useEffect(() => {
    if (!isActive) {
      setVisibleStep(-1);
      return;
    }
    if (pendingRoute) {
      if (pathname === pendingRoute) {
        setPendingRoute(null);
      } else {
        setVisibleStep(-1);
        return;
      }
    }
    const t = setTimeout(() => setVisibleStep(stepIndex), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, stepIndex, pathname, pendingRoute]);

  function goNext() {
    const next = stepIndex + 1;
    if (next >= TUTORIAL_STEPS.length) {
      finishTutorial();
      return;
    }
    const nextStep = TUTORIAL_STEPS[next];
    setStepIndex(next);
    setVisibleStep(-1);
    if (nextStep.route && nextStep.route !== pathname) {
      setPendingRoute(nextStep.route);
      router.push(nextStep.route);
    }
  }

  function startTutorial() {
    setStepIndex(0);
    setVisibleStep(-1);
    setPendingRoute(null);
    setIsActive(true);
  }

  function skipTutorial() {
    setIsActive(false);
    setPendingRoute(null);
    persist();
  }

  function finishTutorial() {
    setIsActive(false);
    setPendingRoute(null);
    persist();
  }

  function persist() {
    setHasCompleted(true);
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  const value: TutorialContextValue = {
    isActive,
    hasCompleted,
    startTutorial,
    skipTutorial,
    finishTutorial,
    nextStep: goNext,
    restart: () => {
      setHasCompleted(false);
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      startTutorial();
    },
  };

  return (
    <TutorialContext.Provider value={value}>
      {children}
      {isActive && visibleStep >= 0 ? (
        <TutorialOverlay
          stepIndex={visibleStep}
          hasNext={visibleStep < TUTORIAL_STEPS.length - 1}
        />
      ) : null}
    </TutorialContext.Provider>
  );
}

export function useTutorial(): TutorialContextValue {
  const ctx = React.useContext(TutorialContext);
  if (!ctx) throw new Error("useTutorial must be used within TutorialProvider");
  return ctx;
}
