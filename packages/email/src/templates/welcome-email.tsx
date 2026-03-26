import { Button, Heading, Text } from "@react-email/components";
import { emailColors } from "@propertypro/tokens/email";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface WelcomeEmailProps extends BaseEmailProps {
  primaryContactName: string;
  communityName: string;
  loginUrl: string;
}

export function WelcomeEmail({
  branding,
  previewText,
  primaryContactName,
  communityName,
  loginUrl,
}: WelcomeEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ?? `Welcome to PropertyPro — your ${communityName} portal is ready`
      }
    >
      <Heading as="h1" style={headingStyle}>
        Welcome to PropertyPro
      </Heading>
      <Text style={textStyle}>Hi {primaryContactName},</Text>
      <Text style={textStyle}>
        Your community portal for <strong>{communityName}</strong> has been set
        up and is ready to use. You can now log in to manage documents, meetings,
        announcements, and compliance requirements.
      </Text>
      <Button style={buttonStyle(branding.accentColor)} href={loginUrl}>
        Log in to your portal
      </Button>
      <Text style={smallTextStyle}>
        If you have questions, reply to this email or contact PropertyPro support.
      </Text>
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

const smallTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: emailColors.textDisabled,
  lineHeight: "20px",
  margin: "0",
};
