/**
 * Badge & StatusBadge — Visual indicators for status and metadata
 */

import React, {
  forwardRef,
  createContext,
  useContext,
  type ReactNode,
  type HTMLAttributes,
} from "react";
import { semanticColors, componentTokens, primitiveFonts } from "../tokens";
import type { StatusVariant } from "../tokens";
import { getStatusConfig, type StatusKey as DomainStatusKey } from "../constants/status";

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

interface StatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
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

// Inline SVG status icons
const StatusIcons = {
  success: ({ size, color }: { size: number; color: string }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13.5 4.5L6 12L2.5 8.5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  warning: ({ size, color }: { size: number; color: string }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 5V8M8 11H8.01M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8Z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  danger: ({ size, color }: { size: number; color: string }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 6L6 10M6 6L10 10M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8Z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  info: ({ size, color }: { size: number; color: string }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 11V8M8 5H8.01M14 8C14 11.3137 11.3137 14 8 14C4.68629 14 2 11.3137 2 8C2 4.68629 4.68629 2 8 2C11.3137 2 14 4.68629 14 8Z" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  neutral: ({ size, color }: { size: number; color: string }) => (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke={color} strokeWidth="1.5" />
    </svg>
  ),
};

function getVariantColors(variant: BadgeVariant, outlined: boolean) {
  const statusColors = semanticColors.status[variant];
  return {
    background: outlined ? "transparent" : statusColors.background,
    color: statusColors.foreground,
    border: outlined ? statusColors.border : "transparent",
  };
}

// Compound: Badge.Icon
interface BadgeIconProps {
  children: ReactNode;
}

const BadgeIcon: React.FC<BadgeIconProps> = ({ children }) => {
  const { size } = useBadgeContext();
  const iconSize = componentTokens.badge.iconSize[size];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: iconSize,
        height: iconSize,
        flexShrink: 0,
      }}
      aria-hidden="true"
    >
      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<{ size?: number }>, { size: iconSize })
        : children}
    </span>
  );
};
BadgeIcon.displayName = "Badge.Icon";

// Compound: Badge.Label
const BadgeLabel: React.FC<{ children: ReactNode }> = ({ children }) => {
  return <span>{children}</span>;
};
BadgeLabel.displayName = "Badge.Label";

// Compound: Badge.Dot
const BadgeDot: React.FC = () => {
  const { variant, size } = useBadgeContext();
  const colors = getVariantColors(variant, false);
  const dotSize = size === "sm" ? 5 : size === "md" ? 6 : 7;

  return (
    <span
      style={{
        width: dotSize,
        height: dotSize,
        borderRadius: "50%",
        background: colors.color,
        flexShrink: 0,
      }}
      aria-hidden="true"
    />
  );
};
BadgeDot.displayName = "Badge.Dot";

// Main Badge
const BadgeRoot = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ variant = "neutral", size = "md", outlined = false, children, style, ...props }, ref) => {
    const { height, padding, gap, radius } = componentTokens.badge;
    const colors = getVariantColors(variant, outlined);
    const isSimpleText = typeof children === "string" || typeof children === "number";

    return (
      <BadgeContext.Provider value={{ size, variant }}>
        <span
          ref={ref}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap,
            height: height[size],
            padding: `0 ${padding[size]}px`,
            borderRadius: radius,
            background: colors.background,
            color: colors.color,
            border: outlined ? `1px solid ${colors.border}` : "none",
            fontFamily: primitiveFonts.family.sans,
            fontSize: primitiveFonts.size.xs,
            fontWeight: primitiveFonts.weight.semibold,
            letterSpacing: primitiveFonts.letterSpacing.wide,
            whiteSpace: "nowrap",
            ...style,
          }}
          {...props}
        >
          {isSimpleText ? <BadgeLabel>{children}</BadgeLabel> : children}
        </span>
      </BadgeContext.Provider>
    );
  }
);
BadgeRoot.displayName = "Badge";

// StatusBadge
export const StatusBadge = forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ status, size = "md", showIcon = true, showLabel = true, ...props }, ref) => {
    const config = getStatusConfig(status);
    const colors = getVariantColors(config.variant, false);
    const IconComponent = StatusIcons[config.icon];
    const iconSize = componentTokens.badge.iconSize[size];

    return (
      <Badge ref={ref} variant={config.variant} size={size} aria-label={config.label} {...props}>
        {showIcon && (
          <Badge.Icon>
            <IconComponent size={iconSize} color={colors.color} />
          </Badge.Icon>
        )}
        {showLabel && <Badge.Label>{config.label}</Badge.Label>}
      </Badge>
    );
  }
);
StatusBadge.displayName = "StatusBadge";

// PriorityBadge
type PriorityValue = "high" | "medium" | "low";

interface PriorityBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  priority: PriorityValue;
  size?: BadgeSize;
}

const priorityConfig: Record<PriorityValue, { variant: StatusVariant; label: string }> = {
  high: { variant: "danger", label: "High" },
  medium: { variant: "warning", label: "Medium" },
  low: { variant: "neutral", label: "Low" },
};

export const PriorityBadge = forwardRef<HTMLSpanElement, PriorityBadgeProps>(
  ({ priority, size = "sm", ...props }, ref) => {
    const config = priorityConfig[priority] || priorityConfig.low;
    return (
      <Badge ref={ref} variant={config.variant} size={size} {...props}>
        {config.label}
      </Badge>
    );
  }
);
PriorityBadge.displayName = "PriorityBadge";

export const Badge = Object.assign(BadgeRoot, {
  Icon: BadgeIcon,
  Label: BadgeLabel,
  Dot: BadgeDot,
});

export type { BadgeProps, BadgeVariant, BadgeSize, StatusBadgeProps };
export default Badge;
