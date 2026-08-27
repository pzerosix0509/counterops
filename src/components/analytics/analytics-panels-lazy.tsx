"use client";

import dynamic from "next/dynamic";

const fallback = <div className="h-72 animate-pulse rounded-md border bg-card" />;

export const RfmPanel = dynamic(
  () => import("./rfm-panel").then((m) => m.RfmPanel),
  { ssr: false, loading: () => fallback }
);

export const SentimentPanel = dynamic(
  () => import("./sentiment-panel").then((m) => m.SentimentPanel),
  { ssr: false, loading: () => fallback }
);

export const ClusterPanel = dynamic(
  () => import("./cluster-panel").then((m) => m.ClusterPanel),
  { ssr: false, loading: () => fallback }
);

export const DemandPanel = dynamic(
  () => import("./demand-panel").then((m) => m.DemandPanel),
  { ssr: false, loading: () => fallback }
);
