import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface AssessmentDueReminderEmailProps extends BaseEmailProps {
  recipientName: string;
  assessmentTitle: string;
  amountDue: string;
  dueDate: string;
  portalUrl: string;
}

export function AssessmentDueReminderEmail({
  branding,
  previewText,
  recipientName,
  assessmentTitle,
  amountDue,
  dueDate,
  portalUrl,
}: AssessmentDueReminderEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `Reminder: ${assessmentTitle} of ${amountDue} is due ${dueDate}`
      }
    >
      <Heading as="h1" style={headingStyle}>
        Assessment Due Reminder
      </Heading>

      <Text style={textStyle}>Hi {recipientName},</Text>
      <Text style={textStyle}>
        This is a friendly reminder that your assessment{" "}
        <strong>{assessmentTitle}</strong> of <strong>{amountDue}</strong> for{" "}
        <strong>{branding.communityName}</strong> is due on{" "}
        <strong>{dueDate}</strong>.
      </Text>

      <div style={reminderBoxStyle}>
        <Text style={reminderTextStyle}>
          Please make your payment before the due date to avoid any late fees.
        </Text>
      </div>

      <Button style={buttonStyle(branding.accentColor)} href={portalUrl}>
        Pay Now
      </Button>

      <Text style={smallTextStyle}>
        If you have already made this payment, please disregard this reminder.
        For questions about your assessment, please contact your association.
      </Text>
    </EmailLayout>
  );
}

const headingStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "bold",
  color: "#111827",
  margin: "0 0 16px 0",
};

const textStyle: React.CSSProperties = {
  fontSize: "16px",
  color: "#374151",
  lineHeight: "24px",
  margin: "0 0 16px 0",
};

const reminderBoxStyle: React.CSSProperties = {
  borderLeft: "4px solid #f59e0b",
  backgroundColor: "#fffbeb",
  padding: "16px",
  margin: "16px 0",
  borderRadius: "0 4px 4px 0",
};

const reminderTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#92400e",
  lineHeight: "20px",
  margin: "0",
};

function buttonStyle(accent?: string): React.CSSProperties {
  return {
    backgroundColor: accent ?? "#f59e0b",
    color: "#ffffff",
    padding: "12px 24px",
    borderRadius: "6px",
    fontSize: "16px",
    fontWeight: "bold",
    textDecoration: "none",
    display: "inline-block",
    margin: "8px 0 24px 0",
  };
}

const smallTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  lineHeight: "20px",
  margin: "0",
  fontStyle: "italic",
};
