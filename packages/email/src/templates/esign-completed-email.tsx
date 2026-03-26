import { Heading, Section, Text } from "@react-email/components";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";
import { emailColors } from "@propertypro/tokens/email";

export interface EsignCompletedEmailProps extends BaseEmailProps {
  senderName: string;
  documentName: string;
  completedAt: string;
  signerCount: number;
}

export function EsignCompletedEmail({
  branding,
  previewText,
  senderName,
  documentName,
  completedAt,
  signerCount,
}: EsignCompletedEmailProps) {
  const signerLabel = signerCount === 1 ? "1 signer" : `${signerCount} signers`;

  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `All signatures collected for "${documentName}"`
      }
    >
      <Heading as="h1" style={headingStyle}>
        All Signatures Collected
      </Heading>
      <Text style={textStyle}>Hi {senderName},</Text>
      <Text style={textStyle}>
        Great news! All signatures have been collected for the following
        document:
      </Text>
      <Section style={documentSectionStyle}>
        <Text style={documentNameStyle}>{documentName}</Text>
      </Section>
      <Section style={detailsSectionStyle}>
        <Text style={detailRowStyle}>
          <strong>Community:</strong> {branding.communityName}
        </Text>
        <Text style={detailRowStyle}>
          <strong>Signers:</strong> {signerLabel}
        </Text>
        <Text style={detailRowStyle}>
          <strong>Completed:</strong> {completedAt}
        </Text>
      </Section>
      <Text style={textStyle}>
        The fully executed document is now available in your documents portal.
      </Text>
      <Text style={smallTextStyle}>
        This is an automated notification from {branding.communityName}.
      </Text>
    </EmailLayout>
  );
}

export default EsignCompletedEmail;

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
  margin: "0 0 12px 0",
};

const smallTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: emailColors.textDisabled,
  lineHeight: "20px",
  margin: "0",
};

const documentSectionStyle: React.CSSProperties = {
  backgroundColor: emailColors.successBackground,
  borderRadius: "6px",
  padding: "12px 16px",
  margin: "0 0 16px 0",
  borderLeft: `4px solid ${emailColors.successBorder}`,
};

const documentNameStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "bold",
  color: emailColors.textPrimary,
  margin: "0",
};

const detailsSectionStyle: React.CSSProperties = {
  backgroundColor: emailColors.surfacePage,
  borderRadius: "6px",
  padding: "12px 16px",
  margin: "0 0 16px 0",
};

const detailRowStyle: React.CSSProperties = {
  fontSize: "15px",
  color: emailColors.textSecondary,
  lineHeight: "24px",
  margin: "0 0 4px 0",
};
