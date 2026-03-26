import { Button, Heading, Text } from "@react-email/components";
import { emailColors } from "@propertypro/tokens/email";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface MaintenanceUpdateEmailProps extends BaseEmailProps {
  recipientName: string;
  requestTitle: string;
  previousStatus: string;
  newStatus: string;
  notes?: string;
  portalUrl: string;
}

export function MaintenanceUpdateEmail({
  branding,
  previewText,
  recipientName,
  requestTitle,
  previousStatus,
  newStatus,
  notes,
  portalUrl,
}: MaintenanceUpdateEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `Update on your maintenance request: ${requestTitle}`
      }
    >
      <Heading as="h1" style={headingStyle}>
        Maintenance Request Update
      </Heading>
      <Text style={textStyle}>Hi {recipientName},</Text>
      <Text style={textStyle}>
        There has been an update to a maintenance request at{" "}
        <strong>{branding.communityName}</strong>.
      </Text>

      <div style={updateBoxStyle}>
        <Text style={requestTitleStyle}>{requestTitle}</Text>
        <table style={detailsTableStyle}>
          <tbody>
            <tr>
              <td style={labelStyle}>Previous Status</td>
              <td style={valueStyle}>
                <span style={statusBadgeStyle(emailColors.textDisabled)}>{previousStatus}</span>
              </td>
            </tr>
            <tr>
              <td style={labelStyle}>New Status</td>
              <td style={valueStyle}>
                <span style={statusBadgeStyle(getStatusColor(newStatus))}>{newStatus}</span>
              </td>
            </tr>
          </tbody>
        </table>
        {notes && (
          <div style={notesBoxStyle}>
            <Text style={notesLabelStyle}>Notes:</Text>
            <Text style={notesTextStyle}>{notes}</Text>
          </div>
        )}
      </div>

      <Button style={buttonStyle(branding.accentColor)} href={portalUrl}>
        View Request
      </Button>
    </EmailLayout>
  );
}

function getStatusColor(status: string): string {
  const lower = status.toLowerCase();
  if (lower === "completed" || lower === "resolved") return emailColors.successForeground;
  if (lower === "in_progress" || lower === "in progress") return emailColors.interactivePrimary;
  if (lower === "rejected" || lower === "cancelled") return emailColors.dangerForeground;
  return emailColors.warningForeground;
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

const updateBoxStyle: React.CSSProperties = {
  backgroundColor: emailColors.surfacePage,
  padding: "16px",
  margin: "16px 0",
  borderRadius: "8px",
  border: `1px solid ${emailColors.borderDefault}`,
};

const requestTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: "bold",
  color: emailColors.textPrimary,
  margin: "0 0 12px 0",
};

const detailsTableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse" as const,
  margin: "0 0 12px 0",
};

const labelStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: "bold",
  color: emailColors.textDisabled,
  padding: "4px 16px 4px 0",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};

const valueStyle: React.CSSProperties = {
  fontSize: "14px",
  color: emailColors.textPrimary,
  padding: "4px 0",
  verticalAlign: "middle",
};

function statusBadgeStyle(color: string): React.CSSProperties {
  return {
    backgroundColor: color,
    color: emailColors.textInverse,
    padding: "2px 10px",
    borderRadius: "12px",
    fontSize: "12px",
    fontWeight: "bold",
    textTransform: "capitalize" as const,
  };
}

const notesBoxStyle: React.CSSProperties = {
  borderTop: `1px solid ${emailColors.borderDefault}`,
  paddingTop: "12px",
  marginTop: "8px",
};

const notesLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: "bold",
  color: emailColors.textDisabled,
  margin: "0 0 4px 0",
};

const notesTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: emailColors.textSecondary,
  lineHeight: "20px",
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
