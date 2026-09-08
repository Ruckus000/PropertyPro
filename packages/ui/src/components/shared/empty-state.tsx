/**
 * EmptyState — Placeholder for empty content areas.
 *
 * Tailwind-based implementation of the pattern documented at
 * docs/design-system/patterns/ (see docs/design-system/README.md). This
 * component is the canonical implementation — the docs folder no longer
 * carries a duplicate .tsx copy.
 *
 * Props-only: the preset lookup (EMPTY_STATE_CONFIGS) lives in the web app's
 * wrapper (apps/web/src/components/shared/empty-state.tsx), which resolves a
 * preset/icon-key to concrete props and delegates to this component.
 */

import * as React from "react";
import { type LucideIcon } from "lucide-react";
import { cn } from "../../utils/cn";

// ── Size config ──

const sizeConfig = {
  sm: {
    container: "py-6 px-4",
    iconContainer: "h-14 w-14",
    iconSize: 24,
    title: "text-base font-semibold",
    description: "text-sm max-w-[280px]",
  },
  md: {
    container: "py-10 px-6",
    iconContainer: "h-[72px] w-[72px]",
    iconSize: 28,
    title: "text-lg font-semibold",
    description: "text-sm max-w-[320px]",
  },
  lg: {
    container: "py-12 px-8",
    iconContainer: "h-[88px] w-[88px]",
    iconSize: 36,
    title: "text-xl font-semibold",
    description: "text-base max-w-[360px]",
  },
} as const;

// ── Props ──

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Icon component */
  icon?: LucideIcon;
  /** Primary message (encouraging, action-oriented) */
  title: string;
  /** Additional context */
  description?: string;
  /** Optional action (usually a button) */
  action?: React.ReactNode;
  /** Size variant */
  size?: "sm" | "md" | "lg";
}

// ── Component ──

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "md",
  className,
  ...rest
}: EmptyStateProps) {
  const s = sizeConfig[size];

  return (
    <div
      className={cn("flex flex-col items-center text-center", s.container, className)}
      {...rest}
    >
      {Icon && (
        <div
          className={cn(
            "mb-4 flex items-center justify-center rounded-full bg-surface-muted",
            s.iconContainer
          )}
        >
          <Icon
            size={s.iconSize}
            className="text-content-tertiary"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
      )}

      <div className="flex flex-col items-center gap-2">
        <h3 className={cn("text-content", s.title)}>{title}</h3>
        {description && (
          <p className={cn("text-content-tertiary", s.description)}>
            {description}
          </p>
        )}
      </div>

      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
