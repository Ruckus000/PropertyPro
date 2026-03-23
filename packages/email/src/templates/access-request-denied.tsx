import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface AccessRequestDeniedEmailProps extends BaseEmailProps {
  recipientName: string;
  reason?: string;
}

export function AccessRequestDeniedEmail({
  branding,
  previewText,
  recipientName,
  reason,
}: AccessRequestDeniedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? "Update on your access request"}
    >
      <Heading as="h1" style={headingStyle}>
        Update on Your Access Request
      </Heading>
      <Text style={textStyle}>Hi {recipientName},</Text>
      <Text style={textStyle}>
        We were unable to approve your access request
        {reason ? ` for the following reason: ${reason}` : "."}.
      </Text>
      <Text style={textStyle}>
        If you believe this is an error, please contact your community
        administrator.
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
