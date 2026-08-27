"use client";
import * as React from "react";
import { FEATURES, MOTION } from "./feature-data";

interface FeatureDemoContextValue {
  activeIndex: number;
  isPaused: boolean;
  reducedMotion: boolean;
  jumpTo: (index: number) => void;
  replay: () => void;
  setPaused: (paused: boolean) => void;
}

const FeatureDemoContext = React.createContext<FeatureDemoContextValue | null>(null);

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function FeatureDemoProvider({ children }: { children: React.ReactNode }) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isPaused, setIsPaused] = React.useState(false);
  const reducedMotion = usePrefersReducedMotion();

  React.useEffect(() => {
    if (reducedMotion || isPaused) return;
    const timer = window.setTimeout(() => {
      setActiveIndex((index) => (index + 1) % FEATURES.length);
    }, MOTION.holdMs);
    return () => window.clearTimeout(timer);
  }, [activeIndex, isPaused, reducedMotion]);

  const value = React.useMemo<FeatureDemoContextValue>(
    () => ({
      activeIndex,
      isPaused,
      reducedMotion,
      jumpTo: setActiveIndex,
      replay: () => {
        setActiveIndex(0);
        setIsPaused(false);
      },
      setPaused: setIsPaused,
    }),
    [activeIndex, isPaused, reducedMotion]
  );

  return <FeatureDemoContext.Provider value={value}>{children}</FeatureDemoContext.Provider>;
}

export function useFeatureDemo(): FeatureDemoContextValue {
  const ctx = React.useContext(FeatureDemoContext);
  if (!ctx) throw new Error("useFeatureDemo must be used within <FeatureDemoProvider>");
  return ctx;
}
