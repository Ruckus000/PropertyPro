/**
 * HeroMetric - Primary dashboard metric (Phase 2.1 / 2.6)
 *
 * - Large value + context
 * - Built-in progress bar with semantic coloring
 * - Four-band semantic status mapping for percent metrics:
 *   100% = success, 80–99% = brand, 50–79% = warning, <50% = danger
 */

import React, { forwardRef, HTMLAttributes, ReactNode } from "react";
import { semanticColors, primitiveFonts, primitiveRadius, primitiveSpace, StatusVariant } from "../../tokens";
import { Stack } from "../../primitives";
import { Text } from "../../primitives";
import { Card } from "../Card/Card";
import { ProgressBar } from "../Progress/ProgressBar";

export type HeroMetricFormat = "number" | "percent" | "currency";
export type HeroMetricTrend = "up" | "down" | "flat";

export interface HeroMetricProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  value: number;
  format?: HeroMetricFormat;
  label: ReactNode;
  context?: ReactNode;
  /**
   * Optional override. If omitted and format="percent", status is derived from value.
   */
  status?: StatusVariant;
  trend?: HeroMetricTrend;
  trendValue?: number;
}

function getPercentStatus(value: number): StatusVariant {
  if (value >= 100) return "success";
  if (value >= 80) return "brand";
  if (value >= 50) return "warning";
  return "danger";
}

function formatValue(value: number, format: HeroMetricFormat) {
  if (format === "percent") return `${value}%`;
  if (format === "currency") return `$${value.toLocaleString()}`;
  return value.toLocaleString();
}

export const HeroMetric = forwardRef<HTMLDivElement, HeroMetricProps>(
  (
    {
      value,
      format = "number",
      label,
      context,
      status,
      trend,
      trendValue,
      style,
      ...props
    },
    ref
  ) => {
    const resolvedStatus: StatusVariant =
      status ?? (format === "percent" ? getPercentStatus(value) : "neutral");

    const colors = semanticColors.status[resolvedStatus] ?? semanticColors.status.neutral;
    const isPositive = trend === "up";
    const isNegative = trend === "down";

    const trendBg = isPositive
      ? semanticColors.status.success.background
      : isNegative
        ? semanticColors.status.danger.background
        : semanticColors.status.neutral.background;

    const trendFg = isPositive
      ? semanticColors.status.success.foreground
      : isNegative
        ? semanticColors.status.danger.foreground
        : semanticColors.status.neutral.foreground;

    return (
      <Card ref={ref} style={style} {...props}>
        <Stack gap={primitiveSpace[3]}>
          <Text
            variant="caption"
            color="tertiary"
            style={{ fontWeight: primitiveFonts.weight.medium, textTransform: "uppercase", letterSpacing: "0.05em" }}
          >
            {label}
          </Text>

          <Stack direction="row" align="baseline" gap={primitiveSpace[2]}>
            <Text variant="display" style={{ color: colors.foreground }}>
              {formatValue(value, format)}
            </Text>
            {trend && trendValue !== undefined && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 6px",
                  borderRadius: primitiveRadius.sm,
                  background: trendBg,
                  color: trendFg,
                  fontSize: primitiveFonts.size.xs,
                  fontWeight: primitiveFonts.weight.bold,
                }}
              >
                {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} {trendValue}%
              </span>
            )}
          </Stack>

          {context && (
            <Text variant="bodySm" color="secondary">
              {context}
            </Text>
          )}

          {format === "percent" && (
            <ProgressBar value={value} max={100} size="sm" showLabel={false} color={colors.foreground} />
          )}
        </Stack>
      </Card>
    );
  }
);

HeroMetric.displayName = "HeroMetric";

export default HeroMetric;

