/**
 * PlanBadge — small pill that marks a feature as gated to a higher plan.
 *
 * Uses the "Florida Modern" gold `status-premium` accent (premium tier). Pairs
 * with the NavRail trailingBadge slot and with feature lock screens. Colors are
 * portable `var()` refs (not named Tailwind classes) so the shared component
 * renders correctly in every app that imports it.
 */
import React from "react";

export type PlanBadgeVariant = "pro" | "plus" | "enterprise";
export type PlanBadgeTone = "light" | "dark";

export interface PlanBadgeProps {
  variant?: PlanBadgeVariant;
  /**
   * `dark` tunes contrast for the dark sidebar; `light` for light surfaces
   * (dialogs, page hero). Defaults to `light`.
   */
  tone?: PlanBadgeTone;
  /** Custom label. Defaults to the variant's display name. */
  label?: string;
  className?: string;
}

const VARIANT_LABELS: Record<PlanBadgeVariant, string> = {
  pro: "Pro",
  plus: "Plus",
  enterprise: "Enterprise",
};

function classes(tone: PlanBadgeTone): string {
  if (tone === "dark") {
    // Solid gold chip for dark surfaces — bright and legible against the rail.
    return "bg-[var(--gold-800)] text-white ring-1 ring-inset ring-[var(--gold-600)]";
  }
  // On light surfaces (dialogs, locked-feature hero) — soft gold tint.
  return "bg-[var(--status-premium-subtle)] text-[var(--status-premium)] ring-1 ring-inset ring-[var(--status-premium-border)]";
}

export function PlanBadge({
  variant = "pro",
  tone = "light",
  label,
  className,
}: PlanBadgeProps) {
  const text = label ?? VARIANT_LABELS[variant];
  return (
    <span
      aria-label={`${text} plan feature`}
      className={[
        "inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[10px] font-semibold uppercase tracking-[0.08em]",
        classes(tone),
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {text}
    </span>
  );
}

export default PlanBadge;
