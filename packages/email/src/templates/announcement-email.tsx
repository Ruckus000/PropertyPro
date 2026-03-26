import { Button, Heading, Text } from "@react-email/components";
import { emailColors } from "@propertypro/tokens/email";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface AnnouncementEmailProps extends BaseEmailProps {
  recipientName: string;
  announcementTitle: string;
  announcementBody: string;
  authorName: string;
  portalUrl: string;
  isPinned?: boolean;
}

export function AnnouncementEmail({
  branding,
  previewText,
  recipientName,
  announcementTitle,
  announcementBody,
  authorName,
  portalUrl,
  isPinned = false,
}: AnnouncementEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `New announcement from ${branding.communityName}: ${announcementTitle}`
      }
    >
      <Heading as="h1" style={headingStyle}>
        {isPinned ? "Important Announcement" : "New Announcement"}
      </Heading>
      <Text style={textStyle}>Hi {recipientName},</Text>
      <Text style={textStyle}>
        A new announcement has been posted at{" "}
        <strong>{branding.communityName}</strong>.
      </Text>

      <div style={announcementBoxStyle}>
        <Text style={announcementTitleStyle}>{announcementTitle}</Text>
        <Text style={announcementBodyStyle}>{announcementBody}</Text>
        <Text style={authorStyle}>Posted by {authorName}</Text>
      </div>

      <Button style={buttonStyle(branding.accentColor)} href={portalUrl}>
        View in Portal
      </Button>
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

const announcementBoxStyle: React.CSSProperties = {
  backgroundColor: emailColors.surfacePage,
  padding: "16px",
  margin: "16px 0",
  borderRadius: "8px",
  border: `1px solid ${emailColors.borderDefault}`,
};

const announcementTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: "bold",
  color: emailColors.textPrimary,
  margin: "0 0 8px 0",
};

const announcementBodyStyle: React.CSSProperties = {
  fontSize: "14px",
  color: emailColors.textSecondary,
  lineHeight: "22px",
  margin: "0 0 12px 0",
};

const authorStyle: React.CSSProperties = {
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
