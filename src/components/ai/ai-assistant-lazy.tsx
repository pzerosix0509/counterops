"use client";

import dynamic from "next/dynamic";

export const AiAssistant = dynamic(
  () => import("./ai-assistant").then((m) => m.AiAssistant),
  { ssr: false, loading: () => <div className="h-[32rem] animate-pulse rounded-md border bg-card" /> }
);
