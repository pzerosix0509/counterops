"use client";
import * as React from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTutorial } from "./tutorial-provider";
import { TUTORIAL_STEPS } from "@/lib/tutorial-steps";

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const CARD_WIDTH = 352;
const CARD_HEIGHT_EST = 240;
const PAD = 6;

function getElementRect(targetId?: string): TargetRect | null {
  if (!targetId) return null;
  const el = document.querySelector<HTMLElement>(`[data-tutorial-id="${targetId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

export function TutorialOverlay({
  stepIndex,
  hasNext,
}: {
  stepIndex: number;
  hasNext: boolean;
}) {
  const { nextStep, skipTutorial, finishTutorial } = useTutorial();
  const [rect, setRect] = React.useState<TargetRect | null>(null);
  const [mounted, setMounted] = React.useState(false);

  const step = TUTORIAL_STEPS[stepIndex];

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    setRect(getElementRect(step?.target));
    if (!step?.target) return;
    const onResize = () => setRect(getElementRect(step.target));
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (!mounted || !step) return null;

  const hasSpotlight = Boolean(step.target && rect);
  const tooltipPos = hasSpotlight && rect ? computeCardPosition(rect) : null;

  return createPortal(
    <>
      {/* Backdrop that blocks interaction, leaving the target visible */}
      <div className="fixed inset-0 z-[80]">
        {hasSpotlight && rect ? (
          <>
            <svg className="h-full w-full" aria-hidden>
              <defs>
                <mask id="tutorial-mask">
                  <rect width="100%" height="100%" fill="white" />
                  <rect
                    x={rect.left}
                    y={rect.top}
                    width={rect.width}
                    height={rect.height}
                    fill="black"
                    rx="10"
                  />
                </mask>
              </defs>
              <rect width="100%" height="100%" fill="rgba(0,0,0,0.6)" mask="url(#tutorial-mask)" />
            </svg>
            <div
              className="pointer-events-none absolute rounded-lg ring-4 ring-ring/60"
              style={{
                left: rect.left - PAD,
                top: rect.top - PAD,
                width: rect.width + PAD * 2,
                height: rect.height + PAD * 2,
              }}
            />
          </>
        ) : (
          <div className="absolute inset-0 bg-black/60" />
        )}
      </div>

      {/* Tooltip card */}
      <div
        className="fixed z-[90] pointer-events-none"
        style={tooltipPos ?? { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
      >
        <div className="pointer-events-auto w-[352px] max-w-[92vw] rounded-xl border bg-background p-5 shadow-xl">
          <StepHeader stepIndex={stepIndex} total={TUTORIAL_STEPS.length} />
          <h3 className="mt-2 text-base font-semibold">{step.title}</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">{step.description}</p>
          <div className="mt-5 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={skipTutorial}>
              Bỏ qua
            </Button>
            <Button size="sm" onClick={() => (hasNext ? nextStep() : finishTutorial())}>
              {hasNext ? (
                <>
                  Tiếp theo <ArrowRight className="h-3.5 w-3.5" />
                </>
              ) : (
                <>
                  Hoàn tất <Check className="h-3.5 w-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

function StepHeader({ stepIndex, total }: { stepIndex: number; total: number }) {
  return (
    <div className="flex items-center gap-2 text-primary">
      <Sparkles className="h-4 w-4" />
      <span className="text-xs font-semibold uppercase tracking-wide">Hướng dẫn</span>
      <span className="ml-auto text-xs text-muted-foreground">
        {stepIndex + 1}/{total}
      </span>
    </div>
  );
}

function computeCardPosition(rect: TargetRect): React.CSSProperties {
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const gap = 16;

  const rightSpace = vw - (rect.left + rect.width);
  const leftSpace = rect.left;
  const belowSpace = vh - (rect.top + rect.height);
  const aboveSpace = rect.top;

  if (rightSpace >= CARD_WIDTH + gap) {
    const top = clamp(rect.top, 8, vh - 8);
    return { left: rect.left + rect.width + gap, top };
  }
  if (leftSpace >= CARD_WIDTH + gap) {
    const top = clamp(rect.top, 8, vh - 8);
    return { right: vw - rect.left + gap, top };
  }
  if (belowSpace >= CARD_HEIGHT_EST + gap) {
    const left = clamp(rect.left, 8, vw - CARD_WIDTH - 8);
    return { left, top: rect.top + rect.height + gap };
  }
  if (aboveSpace >= CARD_HEIGHT_EST + gap) {
    const left = clamp(rect.left, 8, vw - CARD_WIDTH - 8);
    return { left, bottom: vh - rect.top + gap };
  }
  return { left: "50%", top: "50%", transform: "translate(-50%, -50%)" };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
