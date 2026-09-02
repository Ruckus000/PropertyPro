/**
 * StatusBadge — Renders status with icon + label + color.
 *
 * Consumes getStatusConfig() for consistent status display.
 * NEVER uses color alone — always icon + text + color per DESIGN.md.
 *
 * The dot colour comes from `classes.dot` and must NEVER be derived at runtime
 * (this file used to build it with `classes.text.replace("text-", "bg-")`).
 * Tailwind's scanner reads raw file text and cannot see a class assembled in
 * JS, so the utility is never generated and the dot renders with no background
 * — invisible, with nothing thrown or logged. See
 * packages/ui/src/constants/status.ts.
 */

import * as React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Circle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getStatusConfig,
  getStatusClasses,
  type StatusKey,
  type StatusVariant,
  type StatusIconKey,
} from "@/lib/constants/status";

// ── Icon mapping ──

const STATUS_ICONS: Record<StatusIconKey, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  neutral: Circle,
};

// ── Props ──

interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Domain status key (e.g. "overdue", "compliant", "pending") */
  status: StatusKey | string;
  /** Override the default label from STATUS_CONFIG */
  label?: string;
  /** Size variant */
  size?: "sm" | "md" | "lg";
  /** Use subtle background instead of filled */
  subtle?: boolean;
  /** Show only the dot indicator, no text */
  dotOnly?: boolean;
}

const sizeClasses = {
  sm: "h-5 gap-1 px-1.5 text-xs",
  md: "h-6 gap-1.5 px-2 text-xs",
  lg: "h-7 gap-1.5 px-2.5 text-sm",
} as const;

const iconSizes = { sm: 12, md: 14, lg: 16 } as const;

// ── Component ──

export function StatusBadge({
  status,
  label: labelOverride,
  size = "md",
  subtle = false,
  dotOnly = false,
  className,
  ...props
}: StatusBadgeProps) {
  const config = getStatusConfig(status);
  const classes = getStatusClasses(config.variant);
  const Icon = STATUS_ICONS[config.icon];
  const displayLabel = labelOverride ?? config.label;

  if (dotOnly) {
    return (
      <span
        className={cn("inline-flex items-center", className)}
        aria-label={displayLabel}
        {...props}
      >
        <span className={cn("inline-block h-2 w-2 rounded-full", classes.dot)} />
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        sizeClasses[size],
        classes.text,
        subtle ? classes.subtle : classes.bg,
        subtle ? "" : `border ${classes.border}`,
        className
      )}
      {...props}
    >
      <Icon
        size={iconSizes[size]}
        className="shrink-0"
        aria-hidden="true"
      />
      <span>{displayLabel}</span>
    </span>
  );
}

// ── Convenience: StatusDot for inline indicators ──

export function StatusDot({
  variant,
  label,
  className,
  ...props
}: {
  variant: StatusVariant;
  /**
   * REQUIRED. A dot is colour and nothing else, and DESIGN.md forbids conveying
   * status by colour alone ("NEVER color alone. Always icon + text + color").
   * This used to be `aria-hidden`, which removed the only status signal from
   * the accessibility tree entirely. Pair the dot with visible text wherever
   * you can; where the layout genuinely cannot carry a label, this at least
   * names it for assistive tech.
   */
  label: string;
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const classes = getStatusClasses(variant);
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", classes.dot, className)}
      role="img"
      aria-label={label}
      {...props}
    />
  );
}
