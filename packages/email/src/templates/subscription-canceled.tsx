import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface SubscriptionCanceledEmailProps extends BaseEmailProps {
  recipientName: string;
  canceledAt: string;
  gracePeriodEndDate: string;
  billingPortalUrl: string;
}

export function SubscriptionCanceledEmail({
  branding,
  previewText,
  recipientName,
  canceledAt,
  gracePeriodEndDate,
  billingPortalUrl,
}: SubscriptionCanceledEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `Your subscription has been canceled — 30-day grace period ends ${gracePeriodEndDate}`
      }
    >
      <Heading as="h1" style={headingStyle}>
        Subscription Canceled
      </Heading>

      <Text style={textStyle}>Hi {recipientName},</Text>
      <Text style={textStyle}>
        The subscription for <strong>{branding.communityName}</strong> was
        canceled on {canceledAt}.
      </Text>

      <div style={alertBoxStyle}>
        <Text style={alertTitleStyle}>30-Day Grace Period</Text>
        <Text style={alertTextStyle}>
          Your community portal will remain accessible until{" "}
          <strong>{gracePeriodEndDate}</strong>. After that date, access will
          be restricted and your data will be retained for 90 days.
        </Text>
      </div>

      <Button style={buttonStyle(branding.accentColor)} href={billingPortalUrl}>
        Reactivate Subscription
      </Button>

      <Text style={smallTextStyle}>
        To reactivate, click the button above to manage your billing. Your
        community data and settings are preserved.
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

const alertBoxStyle: React.CSSProperties = {
  borderLeft: "4px solid #d97706",
  backgroundColor: "#fffbeb",
  padding: "16px",
  margin: "16px 0",
  borderRadius: "0 4px 4px 0",
};

const alertTitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "bold",
  color: "#92400e",
  margin: "0 0 8px 0",
};

const alertTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#92400e",
  lineHeight: "20px",
  margin: "0",
};

function buttonStyle(accent?: string): React.CSSProperties {
  return {
    backgroundColor: accent ?? "#2563eb",
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
