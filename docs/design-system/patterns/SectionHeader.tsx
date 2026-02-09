/**
 * SectionHeader - Consistent section headings with optional actions
 *
 * Provides a standardized way to introduce sections of content
 * with title, subtitle, and action slots.
 *
 * @example
 * <SectionHeader
 *   title="Compliance Checklist"
 *   subtitle="§718.111(12)(g) requirements"
 *   action={<Button variant="ghost" size="sm">Export</Button>}
 *   collapsible
 *   collapsed={isCollapsed}
 *   onToggle={() => setIsCollapsed(!isCollapsed)}
 * />
 */

import React, { forwardRef, HTMLAttributes, ReactNode } from "react";
import "./SectionHeader.css";
import {
  semanticColors,
  semanticSpacing,
  primitiveFonts,
  primitiveSpace,
  primitiveRadius,
  createTransition,
} from "../tokens";
import { Stack } from "../primitives";
import { Text } from "../primitives";

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface SectionHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  /**
   * Primary heading text
   */
  title: ReactNode;

  /**
   * Secondary description text
   */
  subtitle?: ReactNode;

  /**
   * Action element (usually buttons)
   */
  action?: ReactNode;

  /**
   * Make the section collapsible
   */
  collapsible?: boolean;

  /**
   * Current collapsed state (controlled)
   */
  collapsed?: boolean;

  /**
   * Callback when collapse state changes
   */
  onToggle?: () => void;

  /**
   * Size variant
   */
  size?: "sm" | "md" | "lg";
}

// ═══════════════════════════════════════════════════════════════════════════
// ICONS
// ═══════════════════════════════════════════════════════════════════════════

const ChevronIcon: React.FC<{ collapsed: boolean; size: number }> = ({
  collapsed,
  size,
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 16 16"
    fill="none"
    style={{
      transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)",
      transition: createTransition("transform", "quick"),
    }}
    aria-hidden="true"
  >
    <path
      d="M4 6L8 10L12 6"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export const SectionHeader = forwardRef<HTMLDivElement, SectionHeaderProps>(
  (
    {
      title,
      subtitle,
      action,
      collapsible = false,
      collapsed = false,
      onToggle,
      size = "md",
      style,
      ...props
    },
    ref
  ) => {
    const titleVariant = size === "lg" ? "heading2" : size === "sm" ? "bodySmMedium" : "heading3";
    const marginBottom =
      size === "lg"
        ? semanticSpacing.section.lg
        : size === "sm"
          ? semanticSpacing.section.sm
          : semanticSpacing.section.md;

    const handleToggle = () => {
      if (collapsible && onToggle) {
        onToggle();
      }
    };

    const headerContent = (
      <Stack
        direction="row"
        align={subtitle ? "flex-start" : "center"}
        justify="space-between"
        style={{ flex: 1 }}
      >
        <Stack gap={primitiveSpace[1]}>
          <Text variant={titleVariant} color="primary">
            {title}
          </Text>
          {subtitle && (
            <Text variant="caption" color="tertiary">
              {subtitle}
            </Text>
          )}
        </Stack>
        {action && (
          <Stack direction="row" align="center" gap={primitiveSpace[2]}>
            {action}
          </Stack>
        )}
      </Stack>
    );

    if (collapsible) {
      return (
        <div
          ref={ref}
          style={{
            marginBottom,
            ...style,
          }}
          {...props}
        >
          <button
            type="button"
            onClick={handleToggle}
            aria-expanded={!collapsed}
            className="section-header__toggle"
            style={{
              display: "flex",
              alignItems: "center",
              gap: primitiveSpace[2],
              width: "100%",
              padding: primitiveSpace[2],
              margin: -primitiveSpace[2],
              background: "transparent",
              border: "none",
              borderRadius: primitiveRadius.md,
              cursor: "pointer",
              fontFamily: primitiveFonts.family.sans,
              textAlign: "left",
              color: semanticColors.text.secondary,
              transition: createTransition("background", "micro"),
              ["--section-header-hover-bg" as any]: semanticColors.surface.subtle,
            }}
          >
            <ChevronIcon collapsed={collapsed} size={18} />
            {headerContent}
          </button>
        </div>
      );
    }

    return (
      <div
        ref={ref}
        style={{
          marginBottom,
          ...style,
        }}
        {...props}
      >
        {headerContent}
      </div>
    );
  }
);

SectionHeader.displayName = "SectionHeader";

export default SectionHeader;
