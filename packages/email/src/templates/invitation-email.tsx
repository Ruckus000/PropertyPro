import { Button, Heading, Text } from "@react-email/components";
import { emailColors } from "@propertypro/tokens/email";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface InvitationEmailProps extends BaseEmailProps {
  inviteeName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
  expiresInDays?: number;
}

export function InvitationEmail({
  branding,
  previewText,
  inviteeName,
  inviterName,
  role,
  inviteUrl,
  expiresInDays = 7,
}: InvitationEmailProps) {
  const expirationText = `${expiresInDays} day${expiresInDays !== 1 ? 's' : ''}`;

  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `You've been invited to join ${branding.communityName}`
      }
    >
      <Heading as="h1" style={headingStyle}>
        You&apos;re Invited!
      </Heading>
      <Text style={textStyle}>Hi {inviteeName},</Text>
      <Text style={textStyle}>
        {inviterName} has invited you to join{" "}
        <strong>{branding.communityName}</strong> as a{" "}
        <strong>{role}</strong>.
      </Text>
      <Text style={textStyle}>
        Click the button below to accept your invitation and set up your
        account.
      </Text>
      <Button style={buttonStyle(branding.accentColor)} href={inviteUrl}>
        Accept Invitation
      </Button>
      <Text style={smallTextStyle}>
        This invitation expires in {expirationText}. If you did not expect this
        invitation, you can safely ignore this email.
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
