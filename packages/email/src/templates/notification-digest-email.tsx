import { Button, Heading, Link, Section, Text } from "@react-email/components";
import { emailColors } from "@propertypro/tokens/email";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface NotificationDigestItem {
  title: string;
  summary?: string | null;
  actionUrl?: string | null;
}

export interface NotificationDigestEmailProps extends BaseEmailProps {
  recipientName: string;
  frequency: "daily_digest" | "weekly_digest";
  items: NotificationDigestItem[];
  portalUrl: string;
}

function getDigestLabel(frequency: NotificationDigestEmailProps["frequency"]): string {
  return frequency === "weekly_digest" ? "Weekly" : "Daily";
}

export function NotificationDigestEmail({
  branding,
  previewText,
  recipientName,
  frequency,
  items,
  portalUrl,
}: NotificationDigestEmailProps) {
  const digestLabel = getDigestLabel(frequency);
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `${digestLabel} digest from ${branding.communityName} (${items.length} updates)`
      }
    >
      <Heading as="h1" style={headingStyle}>
        {digestLabel} Notification Digest
      </Heading>
      <Text style={textStyle}>Hi {recipientName},</Text>
      <Text style={textStyle}>
        Here are your latest updates from <strong>{branding.communityName}</strong>.
      </Text>

      <Section style={listStyle}>
        {items.map((item, index) => (
          <div key={`${item.title}-${index}`} style={itemStyle}>
            <Text style={itemTitleStyle}>{item.title}</Text>
            {item.summary ? <Text style={itemSummaryStyle}>{item.summary}</Text> : null}
            {item.actionUrl ? (
              <Link href={item.actionUrl} style={linkStyle}>
                View update
              </Link>
            ) : null}
          </div>
        ))}
      </Section>

      <Button style={buttonStyle(branding.accentColor)} href={portalUrl}>
        Open Community Portal
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

const listStyle: React.CSSProperties = {
  margin: "16px 0",
};

const itemStyle: React.CSSProperties = {
  border: `1px solid ${emailColors.borderDefault}`,
  borderRadius: "8px",
  padding: "12px",
  marginBottom: "12px",
  backgroundColor: emailColors.surfacePage,
};

const itemTitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "bold",
  color: emailColors.textPrimary,
  margin: "0 0 8px 0",
};

const itemSummaryStyle: React.CSSProperties = {
  fontSize: "14px",
  color: emailColors.textSecondary,
  lineHeight: "20px",
  margin: "0 0 6px 0",
};

const linkStyle: React.CSSProperties = {
  fontSize: "13px",
  color: emailColors.interactivePrimary,
  textDecoration: "underline",
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
