"use client";

import dynamic from "next/dynamic";

export const DashboardCharts = dynamic(
  () => import("./dashboard-charts").then((m) => m.DashboardCharts),
  { ssr: false, loading: () => <div className="h-72 animate-pulse rounded-md border bg-card" /> }
);
