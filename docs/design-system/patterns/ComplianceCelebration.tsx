/**
 * ComplianceCelebration - Composed 100% compliance success state
 */

import React from "react";
import { Button, Card } from "../components";
import { Stack, Text } from "../primitives";
import { primitiveRadius, semanticColors, semanticSpacing } from "../tokens";

export interface ComplianceCelebrationProps {
  onDownload?: () => void;
}

const SuccessIcon: React.FC<{ size?: number }> = ({ size = 40 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke={semanticColors.status.success.foreground} strokeWidth="2" />
    <path
      d="M8 12.5L10.5 15L16 9.5"
      stroke={semanticColors.status.success.foreground}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const DownloadIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 4V14M12 14L8 10M12 14L16 10"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M5 18H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export function ComplianceCelebration({ onDownload }: ComplianceCelebrationProps) {
  return (
    <Card elevated style={{ textAlign: "center", padding: semanticSpacing.section.lg }}>
      <Stack align="center" gap={semanticSpacing.stack.lg}>
        <div
          style={{
            width: 80,
            height: 80,
            borderRadius: primitiveRadius.full,
            background: semanticColors.status.success.background,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <SuccessIcon size={40} />
        </div>

        <Text variant="heading" size="lg">
          You're fully compliant!
        </Text>

        <Text variant="body" color="secondary">
          All Florida Statute §718.111(12)(g) requirements are met.
          Keep your documents up to date to maintain compliance.
        </Text>

        <Button variant="secondary" leftIcon={<DownloadIcon size={16} />} onClick={onDownload}>
          Download Compliance Report
        </Button>
      </Stack>
    </Card>
  );
}

export default ComplianceCelebration;
