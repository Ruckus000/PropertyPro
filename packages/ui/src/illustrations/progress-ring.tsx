/**
 * Decorative progress ring for setup progress (spec §6.3: "Text ("0 of 13
 * required posted") beside a decorative ring"). The count is always in the
 * adjacent text, so the ring is hidden from assistive tech.
 *
 * Its arc paints with --interactive-primary, not a fixed coral, so it matches
 * the primary button under a community theme.
 */

import * as React from "react";
import { cn } from "../utils/cn";

export interface ProgressRingProps {
  /** Items done. */
  done: number;
  /** Items that count. Zero draws an empty track. */
  total: number;
  className?: string;
}

const RADIUS = 17;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function ProgressRing({ done, total, className }: ProgressRingProps) {
  const fraction = total > 0 ? Math.min(Math.max(done / total, 0), 1) : 0;
  const arc = fraction * CIRCUMFERENCE;
  return (
    <svg
      viewBox="0 0 44 44"
      aria-hidden="true"
      focusable="false"
      className={cn("size-8 shrink-0", className)}
    >
      <circle cx={22} cy={22} r={RADIUS} fill="none" stroke="var(--sand-100)" strokeWidth={6} />
      {arc > 0 && (
        <circle
          cx={22}
          cy={22}
          r={RADIUS}
          fill="none"
          stroke="var(--interactive-primary)"
          strokeWidth={6}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${CIRCUMFERENCE}`}
          transform="rotate(-90 22 22)"
        />
      )}
    </svg>
  );
}
