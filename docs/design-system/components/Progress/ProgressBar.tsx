/**
 * ProgressBar - Accessible progress indicator
 *
 * - Semantic coloring based on percentage thresholds (Phase 2.6)
 * - Optional label row
 * - role="progressbar" + ARIA value attributes
 */

import React, { forwardRef, HTMLAttributes, ReactNode } from "react";
import {
  semanticColors,
  primitiveFonts,
  primitiveRadius,
  primitiveSpace,
  createTransition,
  StatusVariant,
} from "../../tokens";
import { Stack } from "../../primitives";
import { Text } from "../../primitives";

export type ProgressBarSize = "sm" | "md" | "lg";

export interface ProgressBarProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  value: number;
  max?: number;
  size?: ProgressBarSize;
  /**
   * Override the bar color. If omitted, color is derived from thresholds.
   * - If a StatusVariant is provided, uses its semantic foreground.
   * - Otherwise treats as a raw CSS color string.
   */
  color?: StatusVariant | string;
  label?: ReactNode;
  showLabel?: boolean;
}

function getThresholdStatus(pct: number): StatusVariant {
  return pct >= 100 ? "success" : pct >= 80 ? "brand" : pct >= 50 ? "warning" : "danger";
}

export const ProgressBar = forwardRef<HTMLDivElement, ProgressBarProps>(
  (
    {
      value,
      max = 100,
      size = "md",
      color,
      label,
      showLabel = true,
      style,
      ...props
    },
    ref
  ) => {
    const safeMax = max <= 0 ? 1 : max;
    const pct = Math.max(0, Math.min(100, Math.round((value / safeMax) * 100)));
    const heights: Record<ProgressBarSize, number> = { sm: 4, md: 6, lg: 8 };

    const defaultStatus = getThresholdStatus(pct);
    const statusColors = semanticColors.status[defaultStatus];

    const resolvedBarColor =
      typeof color === "string" && (color as string) in semanticColors.status
        ? semanticColors.status[color as StatusVariant].foreground
        : color || statusColors.foreground;

    return (
      <Stack ref={ref} gap={primitiveSpace[2]} style={style} {...props}>
        {showLabel && (
          <Stack direction="row" align="center" justify="space-between">
            <Text variant="caption" color="tertiary">
              {label ?? "Progress"}
            </Text>
            <Text variant="caption" color="secondary" style={{ fontWeight: primitiveFonts.weight.semibold }}>
              {value}/{max}
            </Text>
          </Stack>
        )}
        <div
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          aria-label={typeof label === "string" ? label : undefined}
          style={{
            height: heights[size],
            background: semanticColors.surface.muted,
            borderRadius: primitiveRadius.full,
            overflow: "hidden",
          }}
        >
          <div
            aria-hidden="true"
            style={{
              height: "100%",
              width: `${pct}%`,
              background: resolvedBarColor,
              borderRadius: primitiveRadius.full,
              transition: createTransition("width", "standard"),
            }}
          />
        </div>
      </Stack>
    );
  }
);

ProgressBar.displayName = "ProgressBar";

export default ProgressBar;

