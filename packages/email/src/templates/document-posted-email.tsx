import { Button, Heading, Text } from "@react-email/components";
import { emailColors } from "@propertypro/tokens/email";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface DocumentPostedEmailProps extends BaseEmailProps {
  recipientName: string;
  documentTitle: string;
  documentCategory?: string;
  uploadedByName: string;
  portalUrl: string;
}

export function DocumentPostedEmail({
  branding,
  previewText,
  recipientName,
  documentTitle,
  documentCategory,
  uploadedByName,
  portalUrl,
}: DocumentPostedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `${branding.communityName}: New document posted`
      }
    >
      <Heading as="h1" style={headingStyle}>
        New Document Posted
      </Heading>
      <Text style={textStyle}>Hi {recipientName},</Text>
      <Text style={textStyle}>
        A new document has been posted at{" "}
        <strong>{branding.communityName}</strong>.
      </Text>

      <div style={documentBoxStyle}>
        <Text style={documentTitleStyle}>{documentTitle}</Text>
        {documentCategory && (
          <Text style={categoryStyle}>
            Category: <strong>{documentCategory}</strong>
          </Text>
        )}
        <Text style={uploadedByStyle}>Uploaded by {uploadedByName}</Text>
      </div>

      <Button style={buttonStyle(branding.accentColor)} href={portalUrl}>
        View Document
      </Button>

      <Text style={smallTextStyle}>
        Per Florida Statute &sect;718.111(12)(g), association documents must be
        available to unit owners through the association&apos;s website.
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

const documentBoxStyle: React.CSSProperties = {
  backgroundColor: emailColors.surfacePage,
  padding: "16px",
  margin: "16px 0",
  borderRadius: "8px",
  border: `1px solid ${emailColors.borderDefault}`,
};

const documentTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: "bold",
  color: emailColors.textPrimary,
  margin: "0 0 8px 0",
};

const categoryStyle: React.CSSProperties = {
  fontSize: "14px",
  color: emailColors.textSecondary,
  margin: "0 0 8px 0",
};

const uploadedByStyle: React.CSSProperties = {
  fontSize: "12px",
  color: emailColors.textDisabled,
  margin: "0",
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
  fontStyle: "italic",
};
