import { Button, Heading, Text } from "@react-email/components";
import { emailColors } from "@propertypro/tokens/email";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface AssessmentPaymentReceivedEmailProps extends BaseEmailProps {
  recipientName: string;
  amountPaid: string;
  assessmentTitle: string;
  dueDate: string;
  paymentDate: string;
  remainingBalance: string;
  portalUrl: string;
}

export function AssessmentPaymentReceivedEmail({
  branding,
  previewText,
  recipientName,
  amountPaid,
  assessmentTitle,
  dueDate,
  paymentDate,
  remainingBalance,
  portalUrl,
}: AssessmentPaymentReceivedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `Payment of ${amountPaid} received`}
    >
      <Heading as="h1" style={headingStyle}>
        Payment Received
      </Heading>

      <Text style={textStyle}>Hi {recipientName},</Text>
      <Text style={textStyle}>
        Your payment of <strong>{amountPaid}</strong> for{" "}
        <strong>{assessmentTitle}</strong> (due {dueDate}) has been successfully
        processed on {paymentDate}.
      </Text>

      <div style={confirmationBoxStyle}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <tbody>
            <tr>
              <td style={labelStyle}>Assessment</td>
              <td style={valueStyle}>{assessmentTitle}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Amount Paid</td>
              <td style={valueStyle}>{amountPaid}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Payment Date</td>
              <td style={valueStyle}>{paymentDate}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Remaining Balance</td>
              <td style={valueStyle}>{remainingBalance}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <Button style={buttonStyle(branding.accentColor)} href={portalUrl}>
        View Payment History
      </Button>

      <Text style={smallTextStyle}>
        This is a confirmation of your payment. No further action is required.
        If you have questions, please contact your association.
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

const confirmationBoxStyle: React.CSSProperties = {
  borderLeft: `4px solid ${emailColors.successForeground}`,
  backgroundColor: emailColors.successBackground,
  padding: "16px",
  margin: "16px 0",
  borderRadius: "0 4px 4px 0",
};

const labelStyle: React.CSSProperties = {
  fontSize: "14px",
  color: emailColors.textDisabled,
  padding: "4px 12px 4px 0",
  verticalAlign: "top",
};

const valueStyle: React.CSSProperties = {
  fontSize: "14px",
  color: emailColors.textPrimary,
  fontWeight: "bold",
  padding: "4px 0",
  verticalAlign: "top",
};

function buttonStyle(accent?: string): React.CSSProperties {
  return {
    backgroundColor: accent ?? emailColors.successForeground,
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
