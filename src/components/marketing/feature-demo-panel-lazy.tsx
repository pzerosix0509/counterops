"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const FeatureDemoPanel = dynamic(
  () => import("./feature-demo-panel").then((m) => m.FeatureDemoPanel),
  {
    ssr: false,
    loading: () => <div className="h-[480px] animate-pulse rounded-lg border bg-muted/40" />,
  }
);

export function FeatureDemoPanelLazy() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setEnabled(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  if (!enabled) return null;
  return <FeatureDemoPanel />;
}
