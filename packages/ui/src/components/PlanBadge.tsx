/**
 * PlanBadge — small pill that marks a feature as gated to a higher plan.
 *
 * Atlassian-style: brand-tinted, full-color (never gray). Pairs with the
 * NavRail trailingBadge slot and with feature lock screens.
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
    // On the dark sidebar — bright brand tint, plenty of contrast against the rail
    return "bg-[var(--interactive-primary)]/20 text-[#7AB6FF] ring-1 ring-inset ring-[var(--interactive-primary)]/40";
  }
  // On light surfaces (dialogs, locked-feature hero)
  return "bg-[var(--interactive-primary)]/10 text-[var(--interactive-primary)] ring-1 ring-inset ring-[var(--interactive-primary)]/25";
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
