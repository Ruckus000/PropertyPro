/**
 * StatusBadge — Renders status with icon + label + color.
 *
 * Consumes getStatusConfig() for consistent status display.
 * NEVER uses color alone — always icon + text + color per DESIGN.md.
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
        <span
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            classes.text.replace("text-", "bg-")
          )}
        />
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
  className,
  ...props
}: {
  variant: StatusVariant;
  className?: string;
} & React.HTMLAttributes<HTMLSpanElement>) {
  const classes = getStatusClasses(variant);
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full",
        classes.text.replace("text-", "bg-"),
        className
      )}
      aria-hidden="true"
      {...props}
    />
  );
}
