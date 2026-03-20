/**
 * AlertBanner — Contextual alert messages with semantic token styling.
 *
 * Tailwind-based implementation of the pattern from
 * docs/design-system/patterns/AlertBanner.tsx.
 *
 * Always renders with role="alert" for accessibility.
 * Always includes icon + text (never color alone).
 */

import * as React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Info,
  Circle,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StatusVariant } from "@/lib/constants/status";

// ── Icon mapping ──

const STATUS_ICONS: Record<StatusVariant, LucideIcon> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  neutral: Circle,
  brand: Info,
};

// ── Variant class mappings ──

const filledClasses: Record<StatusVariant, string> = {
  success: "bg-status-success-bg border-l-status-success text-status-success",
  warning: "bg-status-warning-bg border-l-status-warning text-status-warning",
  danger: "bg-status-danger-bg border-l-status-danger text-status-danger",
  info: "bg-status-info-bg border-l-status-info text-status-info",
  neutral: "bg-status-neutral-bg border-l-status-neutral text-status-neutral",
  brand: "bg-status-brand-bg border-l-status-brand text-status-brand",
};

const subtleClasses: Record<StatusVariant, string> = {
  success:
    "bg-status-success-subtle border border-status-success-border border-l-status-success text-status-success",
  warning:
    "bg-status-warning-subtle border border-status-warning-border border-l-status-warning text-status-warning",
  danger:
    "bg-status-danger-subtle border border-status-danger-border border-l-status-danger text-status-danger",
  info: "bg-status-info-subtle border border-status-info-border border-l-status-info text-status-info",
  neutral:
    "bg-status-neutral-subtle border border-status-neutral-border border-l-status-neutral text-status-neutral",
  brand:
    "bg-status-brand-subtle border border-status-brand-border border-l-status-brand text-status-brand",
};

const outlinedClasses: Record<StatusVariant, string> = {
  success:
    "bg-transparent border border-status-success-border border-l-status-success text-status-success",
  warning:
    "bg-transparent border border-status-warning-border border-l-status-warning text-status-warning",
  danger:
    "bg-transparent border border-status-danger-border border-l-status-danger text-status-danger",
  info: "bg-transparent border border-status-info-border border-l-status-info text-status-info",
  neutral:
    "bg-transparent border border-status-neutral-border border-l-status-neutral text-status-neutral",
  brand:
    "bg-transparent border border-status-brand-border border-l-status-brand text-status-brand",
};

// ── Props ──

interface AlertBannerProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Status determines colors and icon */
  status: StatusVariant;
  /** Primary message */
  title: React.ReactNode;
  /** Additional details */
  description?: React.ReactNode;
  /** Action element (usually a button or link) */
  action?: React.ReactNode;
  /** Show dismiss button */
  dismissible?: boolean;
  /** Callback when dismissed */
  onDismiss?: () => void;
  /** Visual variant */
  variant?: "filled" | "subtle" | "outlined";
}

// ── Component ──

export function AlertBanner({
  status,
  title,
  description,
  action,
  dismissible = false,
  onDismiss,
  variant = "filled",
  className,
  ...props
}: AlertBannerProps) {
  const Icon = STATUS_ICONS[status];

  const variantMap = {
    filled: filledClasses,
    subtle: subtleClasses,
    outlined: outlinedClasses,
  };

  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-3 rounded-md border-l-[3px] p-3",
        variantMap[variant][status],
        className
      )}
      {...props}
    >
      {/* Icon */}
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        {description && (
          <p className="text-sm opacity-85">{description}</p>
        )}
      </div>

      {/* Action */}
      {action && <div className="shrink-0">{action}</div>}

      {/* Dismiss */}
      {dismissible && onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="shrink-0 rounded-sm p-0.5 opacity-70 transition-opacity duration-micro hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
