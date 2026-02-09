/**
 * Compliance status escalation tokens
 */

export const complianceEscalation = {
  calm: {
    variant: "neutral" as const,
    treatment: "subtle",
    iconEmphasis: false,
    description: "> 30 days from deadline",
  },
  aware: {
    variant: "brand" as const,
    treatment: "standard",
    iconEmphasis: false,
    description: "8-30 days from deadline",
  },
  urgent: {
    variant: "warning" as const,
    treatment: "prominent",
    iconEmphasis: true,
    description: "1-7 days from deadline",
  },
  critical: {
    variant: "danger" as const,
    treatment: "persistent",
    iconEmphasis: true,
    description: "Overdue",
  },
} as const;

export type EscalationTier = keyof typeof complianceEscalation;
