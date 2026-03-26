import { Button, Heading, Text } from "@react-email/components";
import { emailColors } from "@propertypro/tokens/email";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface PasswordResetEmailProps extends BaseEmailProps {
  userName: string;
  resetUrl: string;
  expiresInMinutes?: number;
}

export function PasswordResetEmail({
  branding,
  previewText,
  userName,
  resetUrl,
  expiresInMinutes = 60,
}: PasswordResetEmailProps) {
  const expirationText = `${expiresInMinutes} minute${expiresInMinutes !== 1 ? 's' : ''}`;

  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? "Reset your password"}
    >
      <Heading as="h1" style={headingStyle}>
        Password Reset
      </Heading>
      <Text style={textStyle}>Hi {userName},</Text>
      <Text style={textStyle}>
        We received a request to reset the password for your{" "}
        <strong>{branding.communityName}</strong> account. Click the button
        below to choose a new password.
      </Text>
      <Button style={buttonStyle(branding.accentColor)} href={resetUrl}>
        Reset Password
      </Button>
      <Text style={smallTextStyle}>
        This link expires in {expirationText}. If you did not request a
        password reset, you can safely ignore this email. Your password will
        not be changed.
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
