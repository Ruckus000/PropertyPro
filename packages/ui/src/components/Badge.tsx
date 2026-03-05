'use client';

/**
 * Badge & StatusBadge — Visual indicators for status and metadata.
 */

import React, {
  createContext,
  forwardRef,
  useContext,
  type HTMLAttributes,
  type ReactNode,
} from "react";
import type { StatusVariant } from "../tokens";
import {
  getStatusConfig,
  type StatusKey as DomainStatusKey,
} from "../constants/status";

type BadgeVariant = StatusVariant;
type BadgeSize = "sm" | "md" | "lg";

export type StatusKey = DomainStatusKey;

interface BadgeContextValue {
  size: BadgeSize;
  variant: BadgeVariant;
}

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  size?: BadgeSize;
  outlined?: boolean;
  children?: ReactNode;
}

interface StatusBadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  status: DomainStatusKey;
  size?: BadgeSize;
  showIcon?: boolean;
  showLabel?: boolean;
}

const BadgeContext = createContext<BadgeContextValue | null>(null);

function useBadgeContext() {
  const context = useContext(BadgeContext);
  if (!context) {
    throw new Error("Badge compound components must be used within a Badge");
  }
  return context;
}

function cn(...values: Array<string | null | undefined | false>): string {
  return values.filter(Boolean).join(" ");
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: "h-5 px-2 text-[11px] gap-1",
  md: "h-6 px-3 text-[11px] gap-1",
  lg: "h-7 px-3 text-[11px] gap-1",
};

const iconSizeClasses: Record<BadgeSize, string> = {
  sm: "size-3",
  md: "size-3.5",
  lg: "size-4",
};

const iconSizes: Record<BadgeSize, number> = {
  sm: 12,
  md: 14,
  lg: 16,
};

const dotSizeClasses: Record<BadgeSize, string> = {
  sm: "size-[5px]",
  md: "size-1.5",
  lg: "size-[7px]",
};

const solidVariantClasses: Record<BadgeVariant, string> = {
  success:
    "bg-[var(--status-success-bg)] text-[var(--status-success)] dark:bg-green-950 dark:text-green-200",
  brand:
    "bg-[var(--status-brand-bg)] text-[var(--status-brand)] dark:bg-blue-950 dark:text-blue-200",
  warning:
    "bg-[var(--status-warning-bg)] text-[var(--status-warning)] dark:bg-amber-950 dark:text-amber-200",
  danger:
    "bg-[var(--status-danger-bg)] text-[var(--status-danger)] dark:bg-red-950 dark:text-red-200",
  info: "bg-[var(--status-info-bg)] text-[var(--status-info)] dark:bg-sky-950 dark:text-sky-200",
  neutral:
    "bg-[var(--status-neutral-bg)] text-[var(--status-neutral)] dark:bg-gray-800 dark:text-gray-300",
};

const outlinedVariantClasses: Record<BadgeVariant, string> = {
  success:
    "bg-transparent border border-[var(--status-success-border)] text-[var(--status-success)] dark:border-green-500 dark:text-green-200",
  brand:
    "bg-transparent border border-[var(--status-brand-border)] text-[var(--status-brand)] dark:border-blue-500 dark:text-blue-200",
  warning:
    "bg-transparent border border-[var(--status-warning-border)] text-[var(--status-warning)] dark:border-amber-500 dark:text-amber-200",
  danger:
    "bg-transparent border border-[var(--status-danger-border)] text-[var(--status-danger)] dark:border-red-500 dark:text-red-200",
  info:
    "bg-transparent border border-[var(--status-info-border)] text-[var(--status-info)] dark:border-sky-500 dark:text-sky-200",
  neutral:
    "bg-transparent border border-[var(--status-neutral-border)] text-[var(--status-neutral)] dark:border-gray-600 dark:text-gray-300",
};

const dotColorClasses: Record<BadgeVariant, string> = {
  success: "bg-[var(--status-success)] dark:bg-green-300",
  brand: "bg-[var(--status-brand)] dark:bg-blue-300",
  warning: "bg-[var(--status-warning)] dark:bg-amber-300",
  danger: "bg-[var(--status-danger)] dark:bg-red-300",
  info: "bg-[var(--status-info)] dark:bg-sky-300",
  neutral: "bg-[var(--status-neutral)] dark:bg-gray-400",
};

const StatusIcons = {
  success: ({ size, color }: { size: number; color: string }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M13.5 4.5L6 12L2.5 8.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  warning: ({ size, color }: { size: number; color: string }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 5V8M8 11H8.01M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  danger: ({ size, color }: { size: number; color: string }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10 6L6 10M6 6L10 10M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  info: ({ size, color }: { size: number; color: string }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M8 11V8M8 5H8.01M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  neutral: ({ size, color }: { size: number; color: string }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" />
    </svg>
  ),
};

interface BadgeIconProps {
  children: ReactNode;
}

const BadgeIcon: React.FC<BadgeIconProps> = ({ children }) => {
  const { size } = useBadgeContext();
  const iconSize = iconSizes[size];

  return (
    <span
      className={cn("inline-flex items-center justify-center shrink-0", iconSizeClasses[size])}
      aria-hidden="true"
    >
      {React.isValidElement(children)
        ? React.cloneElement(
            children as React.ReactElement<{ size?: number }>,
            { size: iconSize },
          )
        : children}
    </span>
  );
};
BadgeIcon.displayName = "Badge.Icon";

const BadgeLabel: React.FC<{ children: ReactNode }> = ({ children }) => {
  return <span>{children}</span>;
};
BadgeLabel.displayName = "Badge.Label";

const BadgeDot: React.FC = () => {
  const { variant, size } = useBadgeContext();

  return (
    <span
      className={cn(
        "inline-flex rounded-full shrink-0",
        dotSizeClasses[size],
        dotColorClasses[variant],
      )}
      aria-hidden="true"
    />
  );
};
BadgeDot.displayName = "Badge.Dot";

const BadgeRoot = forwardRef<HTMLSpanElement, BadgeProps>(
  (
    {
      variant = "neutral",
      size = "md",
      outlined = false,
      children,
      className,
      ...props
    },
    ref,
  ) => {
    const isSimpleText = typeof children === "string" || typeof children === "number";

    return (
      <BadgeContext.Provider value={{ size, variant }}>
        <span
          ref={ref}
          className={cn(
            "inline-flex items-center rounded-full font-semibold uppercase tracking-wide whitespace-nowrap",
            sizeClasses[size],
            outlined ? outlinedVariantClasses[variant] : solidVariantClasses[variant],
            className,
          )}
          {...props}
        >
          {isSimpleText ? <BadgeLabel>{children}</BadgeLabel> : children}
        </span>
      </BadgeContext.Provider>
    );
  },
);
BadgeRoot.displayName = "Badge";

export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  (
    {
      status,
      size = "md",
      showIcon = true,
      showLabel = true,
      className,
      ...props
    },
    ref,
  ) => {
    const config = getStatusConfig(status);
    const IconComponent = StatusIcons[config.icon];
    const iconSize = iconSizes[size];

    return (
      <Badge
        ref={ref}
        variant={config.variant}
        size={size}
        aria-label={config.label}
        className={className}
        {...props}
      >
        {showIcon && (
          <Badge.Icon>
            <IconComponent size={iconSize} color="currentColor" />
          </Badge.Icon>
        )}
        {showLabel && <Badge.Label>{config.label}</Badge.Label>}
      </Badge>
    );
  },
);
StatusBadge.displayName = "StatusBadge";

type PriorityValue = "high" | "medium" | "low";

interface PriorityBadgeProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  priority: PriorityValue;
  size?: BadgeSize;
}

const priorityConfig: Record<
  PriorityValue,
  { variant: StatusVariant; label: string }
> = {
  high: { variant: "danger", label: "High" },
  medium: { variant: "warning", label: "Medium" },
  low: { variant: "neutral", label: "Low" },
};

export const PriorityBadge = forwardRef<HTMLSpanElement, PriorityBadgeProps>(
  ({ priority, size = "sm", className, ...props }, ref) => {
    const config = priorityConfig[priority] ?? priorityConfig.low;
    return (
      <Badge ref={ref} variant={config.variant} size={size} className={className} {...props}>
        {config.label}
      </Badge>
    );
  },
);
PriorityBadge.displayName = "PriorityBadge";

export const Badge = Object.assign(BadgeRoot, {
  Icon: BadgeIcon,
  Label: BadgeLabel,
  Dot: BadgeDot,
});

export type { BadgeProps, BadgeVariant, BadgeSize, StatusBadgeProps };
export default Badge;
