import { Heading, Text, Link, Section } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailCard } from '../components/email-card';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface MeetingNoticeEmailProps extends BaseEmailProps {
  recipientName: string;
  meetingTitle: string;
  meetingDate: string;
  meetingTime: string;
  location: string;
  agendaUrl?: string;
  meetingType: 'board' | 'owner' | 'special';
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
    meetingType === 'owner' || meetingType === 'special'
      ? '14 days'
      : '48 hours';

  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ?? `Meeting notice: ${meetingTitle} on ${meetingDate}`
      }
    >
      <Heading as="h1" style={styles.heading}>
        Meeting notice
      </Heading>
      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        This is an official notice for the following meeting at{' '}
        <strong>{branding.communityName}</strong>.
      </Text>

      <EmailCard>
        <table
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ borderCollapse: 'collapse' }}
        >
          <tbody>
            <tr>
              <td style={styles.labelCell}>Meeting</td>
              <td style={meetingTitleCell}>{meetingTitle}</td>
            </tr>
            <tr>
              <td style={styles.labelCell}>Type</td>
              <td style={styles.valueCell}>
                <span style={meetingTypeBadge(meetingType)}>
                  {meetingType.charAt(0).toUpperCase() + meetingType.slice(1)}{' '}
                  Meeting
                </span>
              </td>
            </tr>
            <tr>
              <td style={styles.labelCell}>Date</td>
              <td style={styles.valueCell}>{meetingDate}</td>
            </tr>
            <tr>
              <td style={styles.labelCell}>Time</td>
              <td style={styles.valueCell}>{meetingTime}</td>
            </tr>
            <tr>
              <td style={styles.labelCell}>Location</td>
              <td style={styles.valueCell}>{location}</td>
            </tr>
          </tbody>
        </table>
      </EmailCard>

      {agendaUrl && (
        <Section style={{ margin: '0 0 20px 0' }}>
          <Link href={agendaUrl} style={agendaLinkStyle}>
            View meeting agenda &rarr;
          </Link>
        </Section>
      )}

      <Text style={styles.small}>
        Per Florida Statute &sect;718.112, this notice is provided at least{' '}
        {noticeWindow} before the meeting as required by law.
      </Text>
    </EmailLayout>
  );
}

const meetingTitleCell: React.CSSProperties = {
  ...styles.valueCell,
  fontSize: '14px',
  fontWeight: 600,
};

interface MeetingTypeBadgeColors {
  bg: string;
  text: string;
}

function getMeetingTypeColors(
  type: MeetingNoticeEmailProps['meetingType'],
): MeetingTypeBadgeColors {
  if (type === 'owner') return { bg: emailColors.alertInfoBg, text: emailColors.alertInfoText };
  if (type === 'special') return { bg: emailColors.alertWarningBg, text: emailColors.alertWarningText };
  // board — zinc
  return { bg: emailColors.muted, text: emailColors.mutedForeground };
}

function meetingTypeBadge(
  type: MeetingNoticeEmailProps['meetingType'],
): React.CSSProperties {
  const { bg, text } = getMeetingTypeColors(type);
  return {
    display: 'inline-block',
    padding: '2px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: 600,
    backgroundColor: bg,
    color: text,
  };
}

const agendaLinkStyle: React.CSSProperties = {
  color: emailColors.textLink,
  fontSize: '14px',
  fontWeight: 500,
  textDecoration: 'none',
};
