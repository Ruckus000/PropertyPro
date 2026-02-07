/**
 * DeadlineAlert - Deadline callout (Phase 2.2)
 *
 * Status-aware styling:
 * - days < 0: overdue (danger)
 * - days <= 7: urgent (warning)
 * - otherwise: upcoming (neutral)
 *
 * Includes a built-in clock icon and optional action slot.
 */

import React, { forwardRef, HTMLAttributes, ReactNode } from "react";
import { semanticColors, primitiveRadius, primitiveSpace, StatusVariant } from "../../tokens";
import { Stack } from "../../primitives";
import { Text } from "../../primitives";
import { Card } from "../Card/Card";

export interface DeadlineAlertProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title: ReactNode;
  days: number;
  date?: ReactNode;
  action?: ReactNode;
}

function ClockIcon({ size = 20, color }: { size?: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke={color} strokeWidth="1.5" />
      <path
        d="M10 5.8V10.2L12.7 12"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export const DeadlineAlert = forwardRef<HTMLDivElement, DeadlineAlertProps>(
  ({ title, days, date, action, style, ...props }, ref) => {
    const isOverdue = days < 0;
    const isUrgent = days >= 0 && days <= 7;

    const status: StatusVariant = isOverdue ? "danger" : isUrgent ? "warning" : "neutral";
    const colors = semanticColors.status[status];

    return (
      <Card
        ref={ref}
        style={{
          borderLeft: `4px solid ${colors.foreground}`,
          background: isOverdue ? colors.background : semanticColors.surface.default,
          ...style,
        }}
        {...props}
      >
        <Stack direction="row" align="center" justify="space-between" gap={primitiveSpace[4]} style={{ flexWrap: "wrap" }}>
          <Stack direction="row" align="flex-start" gap={primitiveSpace[3]} style={{ flex: 1, minWidth: 200 }}>
            <div
              style={{
                padding: primitiveSpace[2],
                borderRadius: primitiveRadius.full,
                background: colors.background,
                color: colors.foreground,
                flexShrink: 0,
              }}
              aria-hidden="true"
            >
              <ClockIcon size={20} color={colors.foreground} />
            </div>
            <Stack gap={primitiveSpace[1]}>
              <Text variant="heading3" style={{ color: isOverdue ? colors.foreground : semanticColors.text.primary }}>
                {title}
              </Text>
              <Text variant="bodySm" color="secondary">
                {isOverdue ? `Overdue by ${Math.abs(days)} days` : `Due in ${days} days`}
                {date ? ` • ${date}` : null}
              </Text>
            </Stack>
          </Stack>
          {action}
        </Stack>
      </Card>
    );
  }
);

DeadlineAlert.displayName = "DeadlineAlert";

export default DeadlineAlert;

