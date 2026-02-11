import { Heading, Text, Link } from "@react-email/components";
import { EmailLayout } from "../components/email-layout";
import type { BaseEmailProps } from "../types";

export interface MeetingNoticeEmailProps extends BaseEmailProps {
  recipientName: string;
  meetingTitle: string;
  meetingDate: string;
  meetingTime: string;
  location: string;
  agendaUrl?: string;
  meetingType: "board" | "owner" | "special";
}

export function MeetingNoticeEmail({
  branding,
  previewText,
  recipientName,
  meetingTitle,
  meetingDate,
  meetingTime,
  location,
  agendaUrl,
  meetingType,
}: MeetingNoticeEmailProps) {
  const noticeWindow =
    meetingType === "owner" || meetingType === "special"
      ? "14 days"
      : "48 hours";

  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ?? `Meeting Notice: ${meetingTitle} on ${meetingDate}`
      }
    >
      <Heading as="h1" style={headingStyle}>
        Meeting Notice
      </Heading>
      <Text style={textStyle}>Hi {recipientName},</Text>
      <Text style={textStyle}>
        This is an official notice for the following meeting at{" "}
        <strong>{branding.communityName}</strong>.
      </Text>

      <table style={detailsTableStyle}>
        <tbody>
          <tr>
            <td style={labelStyle}>Meeting</td>
            <td style={valueStyle}>{meetingTitle}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Type</td>
            <td style={valueStyle}>
              {meetingType.charAt(0).toUpperCase() + meetingType.slice(1)}{" "}
              Meeting
            </td>
          </tr>
          <tr>
            <td style={labelStyle}>Date</td>
            <td style={valueStyle}>{meetingDate}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Time</td>
            <td style={valueStyle}>{meetingTime}</td>
          </tr>
          <tr>
            <td style={labelStyle}>Location</td>
            <td style={valueStyle}>{location}</td>
          </tr>
        </tbody>
      </table>

      {agendaUrl && (
        <Text style={textStyle}>
          <Link href={agendaUrl} style={linkStyle}>
            View Meeting Agenda
          </Link>
        </Text>
      )}

      <Text style={smallTextStyle}>
        Per Florida Statute §718, this notice is provided at least{" "}
        {noticeWindow} before the meeting as required by law.
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

const detailsTableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse" as const,
  margin: "16px 0",
};

const labelStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: "bold",
  color: "#6b7280",
  padding: "8px 16px 8px 0",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};

const valueStyle: React.CSSProperties = {
  fontSize: "16px",
  color: "#111827",
  padding: "8px 0",
};

const linkStyle: React.CSSProperties = {
  color: "#2563eb",
  textDecoration: "underline",
};

const smallTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#6b7280",
  lineHeight: "20px",
  margin: "16px 0 0 0",
  fontStyle: "italic",
};
