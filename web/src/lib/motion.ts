import type { Transition } from "motion/react";

/** Durations in milliseconds, matching DESIGN_SYSTEM.md CSS tokens. */
export const DURATION_MS = {
  micro: 120,
  panel: 200,
  sheet: 320,
  morph: 700,
  camera: 900,
  tooltipDelay: 400,
  tooltipSkipDelay: 1500,
} as const;

/** Durations in seconds for Motion (`motion/react`). */
export const DURATION_S = {
  micro: 0.12,
  panel: 0.2,
  sheet: 0.32,
  morph: 0.7,
  camera: 0.9,
} as const;

export const EASE = {
  standard: [0.2, 0, 0, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  inout: [0.65, 0, 0.35, 1] as const,
};

export const SPRING_PANEL: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 36,
};

export function getTransition(reduced: boolean | null, normal: Transition): Transition {
  if (reduced) {
    return { duration: 0.01 };
  }
  return normal;
}
