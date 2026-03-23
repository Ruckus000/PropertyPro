import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface OtpVerificationEmailProps extends BaseEmailProps {
  recipientName: string;
  otpCode: string;
  expiresInMinutes?: number;
}

export function OtpVerificationEmail({
  branding,
  previewText,
  recipientName,
  otpCode,
  expiresInMinutes = 10,
}: OtpVerificationEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? "Your verification code"}
    >
      <Heading as="h1" style={headingStyle}>
        Your Verification Code
      </Heading>
      <Text style={textStyle}>Hi {recipientName},</Text>
      <Text style={textStyle}>Your verification code is:</Text>
      <Text style={codeStyle}>{otpCode}</Text>
      <Text style={textStyle}>
        It expires in {expiresInMinutes} minute{expiresInMinutes !== 1 ? "s" : ""}.
      </Text>
      <Text style={smallTextStyle}>
        If you didn't request this, you can safely ignore this email.
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

const codeStyle: React.CSSProperties = {
  fontSize: "32px",
  fontWeight: "bold",
  color: "#111827",
  letterSpacing: "8px",
  textAlign: "center",
  padding: "16px 24px",
  backgroundColor: "#f3f4f6",
  borderRadius: "6px",
  margin: "8px 0 24px 0",
};

const smallTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  lineHeight: "20px",
  margin: "0",
};
