import { Button, Heading, Hr, Section, Text } from "@react-email/components";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface EsignInvitationEmailProps extends BaseEmailProps {
  signerName: string;
  senderName: string;
  documentName: string;
  signingUrl: string;
  expiresAt?: string;
  messageBody?: string;
}

export function EsignInvitationEmail({
  branding,
  previewText,
  signerName,
  senderName,
  documentName,
  signingUrl,
  expiresAt,
  messageBody,
}: EsignInvitationEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `${senderName} has requested your signature on "${documentName}"`
      }
    >
      <Heading as="h1" style={headingStyle}>
        Signature Requested
      </Heading>
      <Text style={textStyle}>Hi {signerName},</Text>
      <Text style={textStyle}>
        {senderName} from <strong>{branding.communityName}</strong> has
        requested your signature on the following document:
      </Text>
      <Section style={documentSectionStyle}>
        <Text style={documentNameStyle}>{documentName}</Text>
      </Section>
      {messageBody && (
        <>
          <Hr style={hrStyle} />
          <Text style={messageLabel}>Message from {senderName}:</Text>
          <Text style={messageBodyStyle}>{messageBody}</Text>
          <Hr style={hrStyle} />
        </>
      )}
      <Text style={textStyle}>
        Please review the document and provide your signature by clicking the
        button below.
      </Text>
      <Button style={buttonStyle(branding.accentColor)} href={signingUrl}>
        Review &amp; Sign Document
      </Button>
      {expiresAt && (
        <Text style={smallTextStyle}>
          This signing request expires on {expiresAt}. Please complete your
          signature before then.
        </Text>
      )}
      <Text style={smallTextStyle}>
        If you did not expect this request, you can safely ignore this email.
      </Text>
    </EmailLayout>
  );
}

export default EsignInvitationEmail;

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
  margin: "0 0 12px 0",
};

function buttonStyle(accent?: string): React.CSSProperties {
  return {
    backgroundColor: accent ?? "#2563eb",
    color: "#ffffff",
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
  color: "#6b7280",
  lineHeight: "20px",
  margin: "0 0 8px 0",
};

const documentSectionStyle: React.CSSProperties = {
  backgroundColor: "#f9fafb",
  borderRadius: "6px",
  padding: "12px 16px",
  margin: "0 0 12px 0",
};

const documentNameStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "bold",
  color: "#111827",
  margin: "0",
};

const hrStyle: React.CSSProperties = {
  borderColor: "#e5e7eb",
  margin: "16px 0",
};

const messageLabel: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: "bold",
  color: "#6b7280",
  margin: "0 0 4px 0",
};

const messageBodyStyle: React.CSSProperties = {
  fontSize: "15px",
  color: "#374151",
  lineHeight: "22px",
  margin: "0 0 4px 0",
  fontStyle: "italic",
};
