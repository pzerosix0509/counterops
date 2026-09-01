"use client";
import * as React from "react";
import { useTutorial } from "@/components/tutorial/tutorial-provider";

export function AutoStartTutorial() {
  const { hasCompleted, isActive, startTutorial } = useTutorial();

  React.useEffect(() => {
    if (!hasCompleted && !isActive) {
      const t = setTimeout(() => startTutorial(), 600);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasCompleted, isActive]);

  return null;
}
