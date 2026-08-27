"use client";
import * as React from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/format";
import { FEATURES } from "./feature-data";
import { useFeatureDemo } from "./feature-demo-context";

const HOLD_MS = 250;

export function FeaturesGrid() {
  const { activeIndex, jumpTo } = useFeatureDemo();
  const holdTimer = React.useRef<number | null>(null);

  const startHold = React.useCallback(
    (index: number) => {
      if (holdTimer.current !== null) return;
      holdTimer.current = window.setTimeout(() => {
        holdTimer.current = null;
        jumpTo(index);
      }, HOLD_MS);
    },
    [jumpTo]
  );

  const clearHold = React.useCallback(() => {
    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  }, []);

  React.useEffect(() => clearHold, [clearHold]);

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {FEATURES.map((feature, index) => {
        const Icon = feature.icon;
        const active = index === activeIndex;
        return (
          <Card
            key={feature.id}
            tabIndex={0}
            role="button"
            aria-pressed={active}
            onClick={() => jumpTo(index)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                jumpTo(index);
              }
            }}
            onPointerDown={() => startHold(index)}
            onPointerUp={clearHold}
            onPointerLeave={clearHold}
            className={cn(
              "cursor-pointer transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "border-primary/60 bg-primary/[0.03] shadow-md" : "hover:shadow-md"
            )}
          >
            <CardHeader>
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-md",
                  active ? "bg-primary text-primary-foreground" : "bg-primary/10"
                )}
              >
                <Icon className={cn("h-5 w-5", !active && "text-primary")} />
              </div>
              <CardTitle className="pt-1.5">{feature.title}</CardTitle>
              <CardDescription>{feature.description}</CardDescription>
            </CardHeader>
          </Card>
        );
      })}
    </div>
  );
}
