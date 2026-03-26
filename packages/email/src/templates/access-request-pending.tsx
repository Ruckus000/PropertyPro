import { Button, Heading, Text } from "@react-email/components";
import { emailColors } from "@propertypro/tokens/email";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface AccessRequestPendingEmailProps extends BaseEmailProps {
  adminName: string;
  requesterName: string;
  requesterEmail: string;
  claimedUnit?: string;
  dashboardUrl: string;
}

export function AccessRequestPendingEmail({
  branding,
  previewText,
  adminName,
  requesterName,
  requesterEmail,
  claimedUnit,
  dashboardUrl,
}: AccessRequestPendingEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? "New resident access request"}
    >
      <Heading as="h1" style={headingStyle}>
        New Resident Access Request
      </Heading>
      <Text style={textStyle}>Hi {adminName},</Text>
      <Text style={textStyle}>
        A new resident access request needs your review.{" "}
        <strong>{requesterName}</strong> ({requesterEmail}) has requested access
        {claimedUnit ? ` for unit ${claimedUnit}` : ""}.
      </Text>
      <Text style={textStyle}>
        Please review the request and approve or deny it from the dashboard.
      </Text>
      <Button style={buttonStyle(branding.accentColor)} href={dashboardUrl}>
        Review Request
      </Button>
    </EmailLayout>
  );
}

const headingStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "bold",
  color: emailColors.textPrimary,
  margin: "0 0 16px 0",
};

const textStyle: React.CSSProperties = {
  fontSize: "16px",
  color: emailColors.textSecondary,
  lineHeight: "24px",
  margin: "0 0 16px 0",
};

function buttonStyle(accent?: string): React.CSSProperties {
  return {
    backgroundColor: accent ?? emailColors.interactivePrimary,
    color: emailColors.textInverse,
    padding: "12px 24px",
    borderRadius: "6px",
    fontSize: "16px",
    fontWeight: "bold",
    textDecoration: "none",
    display: "inline-block",
    margin: "8px 0 24px 0",
  };
}
