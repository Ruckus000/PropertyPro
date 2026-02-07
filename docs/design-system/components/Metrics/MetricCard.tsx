/**
 * MetricCard - Compact metric display card
 *
 * Extracted from the canonical mockup `PropertyProRedesign.jsx`.
 */

import React, { forwardRef } from "react";
import { semanticColors, primitiveSpace } from "../../tokens";
import { Stack } from "../../primitives";
import { Text } from "../../primitives";
import { Card } from "../Card/Card";

export interface MetricCardChange {
  value: number;
  label?: string;
}

export interface MetricCardProps extends Omit<React.ComponentProps<typeof Card>, "children"> {
  value: string | number;
  label: string;
  icon?: React.ComponentType<{ size: number; color: string }>;
  color?: string;
  change?: MetricCardChange;
}

export const MetricCard = forwardRef<HTMLDivElement, MetricCardProps>(
  ({ value, label, icon: Icon, color, change, style, ...props }, ref) => (
    <Card ref={ref} style={{ position: "relative", overflow: "hidden", ...style }} {...props}>
      {color && (
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 3,
            background: color,
            opacity: 0.8,
          }}
          aria-hidden="true"
        />
      )}
      <Stack gap={primitiveSpace[3]}>
        <Stack direction="row" align="center" justify="space-between">
          <Text variant="display" style={{ color: color || semanticColors.text.primary }}>
            {value}
          </Text>
          {Icon && <Icon size={24} color={semanticColors.text.tertiary} />}
        </Stack>
        <Text variant="bodySm" color="secondary">
          {label}
        </Text>
        {change && (
          <Text
            variant="caption"
            style={{
              color:
                change.value >= 0
                  ? semanticColors.status.success.foreground
                  : semanticColors.status.danger.foreground,
            }}
          >
            {change.value >= 0 ? "↑" : "↓"} {Math.abs(change.value)}%
            {change.label ? ` ${change.label}` : " from last month"}
          </Text>
        )}
      </Stack>
    </Card>
  )
);

MetricCard.displayName = "MetricCard";

export default MetricCard;

