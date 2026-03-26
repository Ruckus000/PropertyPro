import { Button, Heading, Text } from "@react-email/components";
import { emailColors } from "@propertypro/tokens/email";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface SignupVerificationEmailProps extends BaseEmailProps {
  primaryContactName: string;
  communityName: string;
  verificationLink: string;
}

export function SignupVerificationEmail({
  branding,
  previewText,
  primaryContactName,
  communityName,
  verificationLink,
}: SignupVerificationEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ?? "Verify your email to continue your PropertyPro signup"
      }
    >
      <Heading as="h1" style={headingStyle}>
        Verify your email
      </Heading>
      <Text style={textStyle}>Hi {primaryContactName},</Text>
      <Text style={textStyle}>
        Thanks for starting signup for{" "}
        <strong>{communityName}</strong>. Verify your email to continue to
        checkout.
      </Text>
      <Button style={buttonStyle(branding.accentColor)} href={verificationLink}>
        Verify Email
      </Button>
      <Text style={smallTextStyle}>
        For security, checkout stays locked until verification is complete.
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
