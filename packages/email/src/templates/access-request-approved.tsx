import { Button, Heading, Text } from "@react-email/components";
import { emailColors } from "@propertypro/tokens/email";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface AccessRequestApprovedEmailProps extends BaseEmailProps {
  recipientName: string;
  loginUrl: string;
}

export function AccessRequestApprovedEmail({
  branding,
  previewText,
  recipientName,
  loginUrl,
}: AccessRequestApprovedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? "Your access request has been approved"}
    >
      <Heading as="h1" style={headingStyle}>
        Access Request Approved
      </Heading>
      <Text style={textStyle}>Hi {recipientName},</Text>
      <Text style={textStyle}>
        Your request to join <strong>{branding.communityName}</strong> has been
        approved. You can now log in and access the resident portal.
      </Text>
      <Button style={buttonStyle(branding.accentColor)} href={loginUrl}>
        Log In
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
