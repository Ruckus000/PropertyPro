import { Button, Heading, Text } from "@react-email/components";
import { emailColors, primitiveColors } from "@propertypro/tokens/email";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface SubscriptionExpiryWarningEmailProps extends BaseEmailProps {
  recipientName: string;
  expiryDate: string;
  billingPortalUrl: string;
}

export function SubscriptionExpiryWarningEmail({
  branding,
  previewText,
  recipientName,
  expiryDate,
  billingPortalUrl,
}: SubscriptionExpiryWarningEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `Final warning: Portal access for ${branding.communityName} expires ${expiryDate}`
      }
    >
      <Heading as="h1" style={headingStyle}>
        Final Warning: Access Expiring Soon
      </Heading>

      <Text style={textStyle}>Hi {recipientName},</Text>
      <Text style={textStyle}>
        This is a final reminder that portal access for{" "}
        <strong>{branding.communityName}</strong> will expire on{" "}
        <strong>{expiryDate}</strong> — 7 days from now.
      </Text>

      <div style={alertBoxStyle}>
        <Text style={alertTitleStyle}>What happens after expiry</Text>
        <Text style={alertTextStyle}>
          After {expiryDate}, all admin access will be suspended. Your data
          will be retained for 90 days, after which it may be permanently
          deleted.
        </Text>
      </div>

      <Button style={buttonStyle(branding.accentColor)} href={billingPortalUrl}>
        Reactivate Now
      </Button>

      <Text style={smallTextStyle}>
        To restore access, reactivate your subscription before the expiry
        date. All your community data and settings are preserved.
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

const alertBoxStyle: React.CSSProperties = {
  borderLeft: `4px solid ${primitiveColors.red[600]}`,
  backgroundColor: emailColors.dangerBackground,
  padding: "16px",
  margin: "16px 0",
  borderRadius: "0 4px 4px 0",
};

const alertTitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "bold",
  color: primitiveColors.red[900],
  margin: "0 0 8px 0",
};

const alertTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: primitiveColors.red[900],
  lineHeight: "20px",
  margin: "0",
};

function buttonStyle(accent?: string): React.CSSProperties {
  return {
    backgroundColor: accent ?? primitiveColors.red[600],
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
  fontStyle: "italic",
};
