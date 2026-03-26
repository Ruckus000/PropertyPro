import { Button, Heading, Text } from "@react-email/components";
import { emailColors, primitiveColors } from "@propertypro/tokens/email";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface PaymentFailedEmailProps extends BaseEmailProps {
  recipientName: string;
  amountDue: string;
  lastFourDigits: string | null;
  billingPortalUrl: string;
}

export function PaymentFailedEmail({
  branding,
  previewText,
  recipientName,
  amountDue,
  lastFourDigits,
  billingPortalUrl,
}: PaymentFailedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `Action required: Payment of ${amountDue} failed`}
    >
      <Heading as="h1" style={headingStyle}>
        Payment Failed
      </Heading>

      <Text style={textStyle}>Hi {recipientName},</Text>
      <Text style={textStyle}>
        We were unable to process a payment of <strong>{amountDue}</strong> for{" "}
        <strong>{branding.communityName}</strong>
        {lastFourDigits ? ` ending in ${lastFourDigits}` : ""}.
      </Text>

      <div style={alertBoxStyle}>
        <Text style={alertTextStyle}>
          Your account remains active for now. Please update your payment
          method to avoid service interruption.
        </Text>
      </div>

      <Button style={buttonStyle(branding.accentColor)} href={billingPortalUrl}>
        Update Payment Method
      </Button>

      <Text style={smallTextStyle}>
        If you believe this is an error, please contact your payment provider.
        This link will generate a fresh billing portal session.
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
