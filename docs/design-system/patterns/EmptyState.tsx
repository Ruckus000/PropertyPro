/**
 * EmptyState - Placeholder for empty content areas
 *
 * API intentionally mirrors the canonical mockup component:
 * icon, title, description, action, size
 */

import React, { forwardRef, HTMLAttributes, ReactNode } from "react";
import {
  semanticColors,
  primitiveSpace,
  primitiveRadius,
} from "../tokens";
import { Stack } from "../primitives";
import { Text } from "../primitives";

interface EmptyIconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

type EmptyStateIcon = React.ComponentType<EmptyIconProps>;

interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Optional icon component
   */
  icon?: EmptyStateIcon;

  /**
   * Primary message
   */
  title: string;

  /**
   * Additional context
   */
  description?: string;

  /**
   * Optional action (typically a button)
   */
  action?: ReactNode;

  /**
   * Size variant
   */
  size?: "sm" | "md" | "lg";
}

const DefaultEmptyIcon: React.FC<EmptyIconProps> = ({ size = 28, color = semanticColors.text.tertiary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3" y="4" width="18" height="16" rx="2" stroke={color} strokeWidth="1.5" />
    <path d="M3 9H21" stroke={color} strokeWidth="1.5" />
    <path d="M8 14H16" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const SearchEmptyIcon: React.FC<EmptyIconProps> = ({ size = 28, color = semanticColors.text.tertiary }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="11" cy="11" r="6" stroke={color} strokeWidth="1.5" />
    <path d="M20 20L15.5 15.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    <path d="M9 9L13 13M13 9L9 13" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  (
    {
      icon: Icon,
      title,
      description,
      action,
      size = "md",
      style,
      ...props
    },
    ref
  ) => {
    const iconSize = size === "lg" ? 64 : size === "sm" ? 40 : 48;
    const containerPadding =
      size === "lg" ? primitiveSpace[12] : size === "sm" ? primitiveSpace[6] : primitiveSpace[10];

    return (
      <Stack
        ref={ref}
        align="center"
        gap={primitiveSpace[4]}
        style={{
          padding: containerPadding,
          textAlign: "center",
          ...style,
        }}
        {...props}
      >
        <div
          style={{
            width: iconSize + 24,
            height: iconSize + 24,
            borderRadius: primitiveRadius.full,
            background: semanticColors.surface.muted,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {Icon ? (
            <Icon size={iconSize * 0.6} color={semanticColors.text.tertiary} strokeWidth={1.5} />
          ) : (
            <DefaultEmptyIcon size={iconSize * 0.6} color={semanticColors.text.tertiary} />
          )}
        </div>

        <Stack gap={primitiveSpace[2]} align="center">
          <Text variant={size === "lg" ? "heading2" : "heading3"} color="primary">
            {title}
          </Text>
          {description && (
            <Text
              variant="bodySm"
              color="tertiary"
              style={{ maxWidth: 320 }}
            >
              {description}
            </Text>
          )}
        </Stack>

        {action}
      </Stack>
    );
  }
);

EmptyState.displayName = "EmptyState";

interface PresetEmptyStateProps extends Omit<EmptyStateProps, "icon" | "title" | "description"> {
  action?: ReactNode;
}

export const NoResults = forwardRef<HTMLDivElement, PresetEmptyStateProps>(
  ({ action, ...props }, ref) => (
    <EmptyState
      ref={ref}
      icon={SearchEmptyIcon}
      title="No results found"
      description="Try adjusting your search or filters to find what you're looking for."
      action={action}
      {...props}
    />
  )
);
NoResults.displayName = "NoResults";

export const NoData = forwardRef<HTMLDivElement, PresetEmptyStateProps>(
  ({ action, ...props }, ref) => (
    <EmptyState
      ref={ref}
      icon={DefaultEmptyIcon}
      title="No data yet"
      description="Get started by adding your first item."
      action={action}
      {...props}
    />
  )
);
NoData.displayName = "NoData";

export default EmptyState;
