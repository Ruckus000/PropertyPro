import { Heading, Text, Section } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailCard } from '../components/email-card';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

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
      <Heading as="h1" style={styles.heading}>
        Maintenance request update
      </Heading>
      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        There has been an update to a maintenance request at{' '}
        <strong>{branding.communityName}</strong>.
      </Text>

      <EmailCard>
        <p style={cardTitleStyle}>{requestTitle}</p>
        <table
          width="100%"
          cellPadding={0}
          cellSpacing={0}
          style={{ borderCollapse: 'collapse', marginTop: '8px' }}
        >
          <tbody>
            <tr>
              <td style={styles.labelCell}>Previous status</td>
              <td style={styles.valueCell}>
                <span style={statusBadge(getStatusBadgeColors(previousStatus))}>
                  {previousStatus}
                </span>
              </td>
            </tr>
            <tr>
              <td style={styles.labelCell}>Current status</td>
              <td style={styles.valueCell}>
                <span style={statusBadge(getStatusBadgeColors(newStatus))}>
                  {newStatus}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
        {notes && (
          <div style={notesSectionStyle}>
            <p style={notesLabelStyle}>Notes</p>
            <p style={notesTextStyle}>{notes}</p>
          </div>
        )}
      </EmailCard>

      <Section style={styles.buttonSection}>
        <EmailButton href={portalUrl} variant="default">
          View request
        </EmailButton>
      </Section>

      <Text style={styles.smallSpaced}>
        This notification was sent because you submitted or are assigned to this
        maintenance request.
      </Text>
    </EmailLayout>
  );
}

interface BadgeColors {
  bg: string;
  text: string;
}

function getStatusBadgeColors(status: string): BadgeColors {
  const lower = status.toLowerCase();
  if (lower === 'completed' || lower === 'resolved') {
    return { bg: '#DCFCE7', text: '#166534' };
  }
  if (lower === 'in_progress' || lower === 'in progress') {
    return { bg: '#FEF9C3', text: '#854D0E' };
  }
  if (lower === 'rejected' || lower === 'cancelled') {
    return { bg: '#FEE2E2', text: '#991B1B' };
  }
  return { bg: '#FEF3C7', text: '#92400E' };
}

// Keep legacy name for any external references
function getStatusColor(status: string): string {
  return getStatusBadgeColors(status).text;
}

function statusBadge({ bg, text }: BadgeColors): React.CSSProperties {
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

const cardTitleStyle: React.CSSProperties = {
  fontSize: '15px',
  fontWeight: 600,
  color: emailColors.foreground,
  margin: '0 0 4px 0',
};

const notesSectionStyle: React.CSSProperties = {
  borderTop: `1px solid ${emailColors.border}`,
  paddingTop: '12px',
  marginTop: '12px',
};

const notesLabelStyle: React.CSSProperties = {
  fontSize: '12px',
  fontWeight: 600,
  color: emailColors.mutedForeground,
  margin: '0 0 4px 0',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.05em',
};

const notesTextStyle: React.CSSProperties = {
  fontSize: '14px',
  color: emailColors.foreground,
  lineHeight: '1.55',
  margin: '0',
};

export { getStatusColor };
