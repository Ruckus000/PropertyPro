/**
 * AlertBanner - Contextual alert messages
 *
 * Displays important messages with appropriate status styling.
 * Supports dismissible alerts, actions, and descriptions.
 *
 * @example
 * <AlertBanner
 *   status="danger"
 *   title="Insurance Policies upload is overdue"
 *   description="Required under §718.111(11)"
 *   action={<Button variant="link">Upload now</Button>}
 *   onDismiss={() => setDismissed(true)}
 * />
 */

import React, { forwardRef, HTMLAttributes, ReactNode } from "react";
import "./AlertBanner.css";
import {
  semanticColors,
  semanticElevation,
  primitiveSpace,
  primitiveRadius,
  createTransition,
  StatusVariant,
} from "../tokens";
import { Stack } from "../primitives";
import { Text } from "../primitives";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface AlertBannerProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /**
   * Status type determines colors and icon
   */
  status: StatusVariant;

  /**
   * Primary message
   */
  title: ReactNode;

  /**
   * Additional details
   */
  description?: ReactNode;

  /**
   * Action element (usually a button or link)
   */
  action?: ReactNode;

  /**
   * Show dismiss button
   */
  dismissible?: boolean;

  /**
   * Callback when dismissed
   */
  onDismiss?: () => void;

  /**
   * Variant style
   */
  variant?: "filled" | "subtle" | "outlined";
}

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════

const StatusIcons: Record<StatusVariant, React.FC<{ size: number; color: string }>> = {
  success: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M16.5 5.5L7.5 14.5L3.5 10.5"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  warning: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 7V10M10 13H10.01M18 10C18 14.4183 14.4183 18 10 18C5.58172 18 2 14.4183 2 10C2 5.58172 5.58172 2 10 2C14.4183 2 18 5.58172 18 10Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  danger: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M12 8L8 12M8 8L12 12M18 10C18 14.4183 14.4183 18 10 18C5.58172 18 2 14.4183 2 10C2 5.58172 5.58172 2 10 2C14.4183 2 18 5.58172 18 10Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  info: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 14V10M10 6H10.01M18 10C18 14.4183 14.4183 18 10 18C5.58172 18 2 14.4183 2 10C2 5.58172 5.58172 2 10 2C14.4183 2 18 5.58172 18 10Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  neutral: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7" stroke={color} strokeWidth="1.5" />
    </svg>
  ),
  brand: ({ size, color }) => (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 14V10M10 6H10.01M18 10C18 14.4183 14.4183 18 10 18C5.58172 18 2 14.4183 2 10C2 5.58172 5.58172 2 10 2C14.4183 2 18 5.58172 18 10Z"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
};

const CloseIcon: React.FC<{ size: number; color: string }> = ({ size, color }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M12 4L4 12M4 4L12 12"
      stroke={color}
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const AlertBanner = forwardRef<HTMLDivElement, AlertBannerProps>(
  (
    {
      status,
      title,
      description,
      action,
      dismissible = false,
      onDismiss,
      variant = "filled",
      style,
      ...props
    },
    ref
  ) => {
    const statusColors = semanticColors.status[status];
    const IconComponent = StatusIcons[status];

    // Variant styles
    const variantStyles = {
      filled: {
        background: statusColors.background,
        border: "none",
        borderLeft: `3px solid ${statusColors.foreground}`,
      },
      subtle: {
        background: statusColors.subtle,
        border: `1px solid ${statusColors.border}`,
        borderLeft: `3px solid ${statusColors.foreground}`,
      },
      outlined: {
        background: "transparent",
        border: `1px solid ${statusColors.border}`,
        borderLeft: `3px solid ${statusColors.foreground}`,
      },
    };

    const currentVariant = variantStyles[variant];

    return (
      <div
        ref={ref}
        role="alert"
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: primitiveSpace[3],
          padding: `${primitiveSpace[3]}px ${primitiveSpace[4]}px`,
          borderRadius: primitiveRadius.md,
          boxShadow: semanticElevation.e0.shadow,
          ...currentVariant,
          ...style,
        }}
        {...props}
      >
        {/* Icon */}
        <div
          style={{
            flexShrink: 0,
            marginTop: 2,
          }}
        >
          <IconComponent size={18} color={statusColors.foreground} />
        </div>

        {/* Content */}
        <Stack gap={primitiveSpace[1]} style={{ flex: 1, minWidth: 0 }}>
          <Text
            variant="bodySmMedium"
            style={{ color: statusColors.foreground }}
          >
            {title}
          </Text>
          {description && (
            <Text
              variant="bodySm"
              style={{ color: statusColors.foreground, opacity: 0.85 }}
            >
              {description}
            </Text>
          )}
        </Stack>

        {/* Action */}
        {action && (
          <div style={{ flexShrink: 0 }}>
            {action}
          </div>
        )}

        {/* Dismiss button */}
        {dismissible && onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss"
            className="alert-banner__dismiss"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 24,
              height: 24,
              padding: 0,
              background: "transparent",
              border: "none",
              borderRadius: primitiveRadius.sm,
              cursor: "pointer",
              flexShrink: 0,
              opacity: 0.7,
              transition: createTransition("opacity", "micro"),
            }}
          >
            <CloseIcon size={16} color={statusColors.foreground} />
          </button>
        )}
      </div>
    );
  }
);

AlertBanner.displayName = "AlertBanner";

export default AlertBanner;
