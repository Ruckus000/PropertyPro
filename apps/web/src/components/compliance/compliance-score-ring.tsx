"use client";

import { motion, useReducedMotion } from "framer-motion";
import { semanticMotion } from "@propertypro/ui/tokens";
import type { EscalationTier } from "@propertypro/ui/tokens";

// ── Score Ring SVG ──────────────────────────────────

const SIZE = 120;
const STROKE = 8;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/** Map percentage to escalation tier. */
export function getScoreTier(pct: number, hasOverdue: boolean): EscalationTier {
  if (hasOverdue) return "critical";
  if (pct >= 100) return "calm";
  if (pct >= 70) return "aware";
  if (pct >= 40) return "urgent";
  return "critical";
}

const tierColors: Record<EscalationTier, string> = {
  calm: "var(--status-success)",
  aware: "var(--interactive-primary)",
  urgent: "var(--status-warning)",
  critical: "var(--status-danger)",
};

interface ComplianceScoreRingProps {
  percentage: number;
  tier: EscalationTier;
}

export function ComplianceScoreRing({ percentage, tier }: ComplianceScoreRingProps) {
  const reduced = useReducedMotion();
  const offset = CIRCUMFERENCE - (percentage / 100) * CIRCUMFERENCE;
  const color = tierColors[tier];

  return (
    <div className="relative flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
        {/* Background track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="var(--border-default)"
          strokeWidth={STROKE}
          opacity={0.2}
        />
        {/* Animated progress arc */}
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          initial={{ strokeDashoffset: CIRCUMFERENCE }}
          animate={{ strokeDashoffset: offset }}
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: semanticMotion.attention.duration / 1000,
                  ease: [0.34, 1.56, 0.64, 1], // bounce
                  delay: 0.2,
                }
          }
        />
      </svg>
      {/* Center label */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <motion.span
          className="text-2xl font-bold tabular-nums text-content"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={
            reduced
              ? { duration: 0 }
              : { duration: 0.3, delay: 0.4 }
          }
        >
          {percentage}%
        </motion.span>
        <span className="text-[10px] font-medium uppercase tracking-wider text-content-tertiary">
          Compliant
        </span>
      </div>
    </div>
  );
}
