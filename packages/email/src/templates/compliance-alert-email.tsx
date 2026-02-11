import { Button, Heading, Text } from "@react-email/components";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface ComplianceAlertEmailProps extends BaseEmailProps {
  recipientName: string;
  alertTitle: string;
  alertDescription: string;
  dueDate?: string;
  dashboardUrl: string;
  severity: "info" | "warning" | "critical";
}

export function ComplianceAlertEmail({
  branding,
  previewText,
  recipientName,
  alertTitle,
  alertDescription,
  dueDate,
  dashboardUrl,
  severity,
}: ComplianceAlertEmailProps) {
  const severityColor =
    severity === "critical"
      ? "#dc2626"
      : severity === "warning"
        ? "#d97706"
        : "#2563eb";

  const severityLabel =
    severity.charAt(0).toUpperCase() + severity.slice(1);

  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `Compliance Alert: ${alertTitle}`
      }
    >
      <Heading as="h1" style={headingStyle}>
        Compliance Alert
      </Heading>

      <div style={badgeContainerStyle}>
        <span style={badgeStyle(severityColor)}>{severityLabel}</span>
      </div>

      <Text style={textStyle}>Hi {recipientName},</Text>
      <Text style={textStyle}>
        A compliance item requires your attention at{" "}
        <strong>{branding.communityName}</strong>.
      </Text>

      <div style={alertBoxStyle(severityColor)}>
        <Text style={alertTitleStyle}>{alertTitle}</Text>
        <Text style={alertDescStyle}>{alertDescription}</Text>
        {dueDate && (
          <Text style={dueDateStyle}>Due by: {dueDate}</Text>
        )}
      </div>

      <Button style={buttonStyle(branding.accentColor)} href={dashboardUrl}>
        View Compliance Dashboard
      </Button>

      <Text style={smallTextStyle}>
        Florida Statute §718.111(12)(g) requires timely posting of
        association documents. Failure to comply may result in regulatory
        action.
      </Text>
    </EmailLayout>
  );
}

const headingStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: "bold",
  color: "#111827",
  margin: "0 0 8px 0",
};

const badgeContainerStyle: React.CSSProperties = {
  margin: "0 0 16px 0",
};

function badgeStyle(color: string): React.CSSProperties {
  return {
    backgroundColor: color,
    color: "#ffffff",
    padding: "4px 12px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "bold",
    textTransform: "uppercase" as const,
  };
}

const textStyle: React.CSSProperties = {
  fontSize: "16px",
  color: "#374151",
  lineHeight: "24px",
  margin: "0 0 16px 0",
};

function alertBoxStyle(borderColor: string): React.CSSProperties {
  return {
    borderLeft: `4px solid ${borderColor}`,
    backgroundColor: "#f9fafb",
    padding: "16px",
    margin: "16px 0",
    borderRadius: "0 4px 4px 0",
  };
}

const alertTitleStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: "bold",
  color: "#111827",
  margin: "0 0 8px 0",
};

const alertDescStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#4b5563",
  lineHeight: "20px",
  margin: "0 0 8px 0",
};

const dueDateStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: "bold",
  color: "#dc2626",
  margin: "0",
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
  fontStyle: "italic",
};
