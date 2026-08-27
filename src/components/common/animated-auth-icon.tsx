"use client";
import { useEffect, useRef } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { Variants } from "framer-motion";
import { cn } from "@/lib/utils/format";

const JAIL_RADIUS = 7;
const SPRING = { stiffness: 260, damping: 15, mass: 0.7 };
const WAVE_DURATION = 0.6;
const DOT_STAGGER = 0.12;

const waveVariants: Variants = {
  rest: { y: 0, opacity: 1 },
  wave: { y: [0, -5, 0], opacity: [0.35, 1, 0.35] },
};

function WavingDots() {
  return (
    <div className="flex items-center gap-1" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          variants={waveVariants}
          initial="rest"
          animate="wave"
          transition={{
            duration: WAVE_DURATION,
            repeat: Infinity,
            ease: "easeInOut",
            delay: i * DOT_STAGGER,
          }}
          className="h-1.5 w-1.5 rounded-full bg-primary"
        />
      ))}
    </div>
  );
}

interface AnimatedAuthIconProps {
  icon: LucideIcon;
  pending: boolean;
  className?: string;
}

export function AnimatedAuthIcon({ icon: Icon, pending, className }: AnimatedAuthIconProps) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, SPRING);
  const sy = useSpring(my, SPRING);
  const rotate = useTransform(sx, [-JAIL_RADIUS, JAIL_RADIUS], [-10, 10]);

  useEffect(() => {
    if (reduced) return;
    function onMove(e: PointerEvent) {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dx = e.clientX - (rect.left + rect.width / 2);
      const dy = e.clientY - (rect.top + rect.height / 2);
      const dist = Math.hypot(dx, dy);
      const clamped = dist > JAIL_RADIUS ? JAIL_RADIUS / dist : 1;
      mx.set(dx * clamped);
      my.set(dy * clamped);
    }
    window.addEventListener("pointermove", onMove);
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced, mx, my]);

  return (
    <motion.div
      whileTap={reduced ? undefined : { scale: 0.9 }}
      transition={{ type: "spring", stiffness: 400, damping: 18 }}
      className={cn(
        "flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border bg-muted/50",
        className
      )}
    >
      <motion.div
        ref={ref}
        style={reduced ? undefined : { x: sx, y: sy, rotate }}
        className="flex items-center justify-center"
      >
        <AnimatePresence mode="wait" initial={false}>
          {pending ? (
            <motion.div
              key="dots"
              initial={{ opacity: 0, scale: 0.6, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: -4 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <WavingDots />
            </motion.div>
          ) : (
            <motion.div
              key="icon"
              initial={{ opacity: 0, scale: 0.6, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.6, y: 4 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <motion.div
                animate={
                  reduced ? undefined : { y: [0, -1.5, 0], scale: [1, 1.06, 1] }
                }
                transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
              >
                <Icon className="h-5 w-5 text-primary" />
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
