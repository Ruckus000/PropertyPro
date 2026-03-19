import { Button, Heading, Section, Text } from "@react-email/components";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface EsignReminderEmailProps extends BaseEmailProps {
  signerName: string;
  documentName: string;
  signingUrl: string;
  reminderNumber: number;
  expiresAt?: string;
}

export function EsignReminderEmail({
  branding,
  previewText,
  signerName,
  documentName,
  signingUrl,
  reminderNumber,
  expiresAt,
}: EsignReminderEmailProps) {
  const ordinal = formatOrdinal(reminderNumber);

  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `Reminder: Your signature is needed on "${documentName}"`
      }
    >
      <Heading as="h1" style={headingStyle}>
        Signature Reminder
      </Heading>
      <Text style={textStyle}>Hi {signerName},</Text>
      <Text style={textStyle}>
        This is your {ordinal} reminder that your signature is still needed on
        the following document from{" "}
        <strong>{branding.communityName}</strong>:
      </Text>
      <Section style={documentSectionStyle}>
        <Text style={documentNameStyle}>{documentName}</Text>
      </Section>
      {expiresAt && (
        <Text style={urgentTextStyle}>
          This signing request expires on {expiresAt}. Please sign before
          the deadline to avoid delays.
        </Text>
      )}
      <Text style={textStyle}>
        Please review and sign the document at your earliest convenience.
      </Text>
      <Button style={buttonStyle(branding.accentColor)} href={signingUrl}>
        Sign Now
      </Button>
      <Text style={smallTextStyle}>
        If you have already signed this document, please disregard this
        reminder.
      </Text>
    </EmailLayout>
  );
}

export default EsignReminderEmail;

function formatOrdinal(n: number): string {
  const suffixes: Record<string, string> = {
    one: "st",
    two: "nd",
    few: "rd",
    other: "th",
  };
  const pr = new Intl.PluralRules("en-US", { type: "ordinal" });
  const rule = pr.select(n);
  return `${n}${suffixes[rule] ?? "th"}`;
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
  margin: "0",
};

const documentSectionStyle: React.CSSProperties = {
  backgroundColor: "#fffbeb",
  borderRadius: "6px",
  padding: "12px 16px",
  margin: "0 0 12px 0",
  borderLeft: "4px solid #f59e0b",
};

const documentNameStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "bold",
  color: "#111827",
  margin: "0",
};

const urgentTextStyle: React.CSSProperties = {
  fontSize: "15px",
  color: "#b45309",
  lineHeight: "22px",
  margin: "0 0 12px 0",
  fontWeight: "bold",
};
