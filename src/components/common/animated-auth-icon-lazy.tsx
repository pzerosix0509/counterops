"use client";

import dynamic from "next/dynamic";

export const AnimatedAuthIcon = dynamic(
  () => import("./animated-auth-icon").then((m) => m.AnimatedAuthIcon),
  { ssr: false, loading: () => <div className="mx-auto h-12 w-12 rounded-full bg-muted" aria-hidden /> }
);
