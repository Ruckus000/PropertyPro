import { Heading, Hr, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailAlert } from '../components/email-alert';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export type EmergencyAlertSeverity = 'emergency' | 'urgent' | 'info';

export interface EmergencyAlertEmailProps extends BaseEmailProps {
  recipientName: string;
  alertTitle: string;
  alertBody: string;
  severity: EmergencyAlertSeverity;
  sentAt: string;
}

export function EmergencyAlertEmail({
  branding,
  previewText,
  recipientName,
  alertTitle,
  alertBody,
  severity,
  sentAt,
}: EmergencyAlertEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      accentColor={emailColors.accentRed}
      previewText={previewText ?? `Emergency Alert: ${alertTitle} — ${branding.communityName}`}
    >
      {/* Red emergency banner */}
      <table
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={{ background: '#DC2626', borderRadius: '6px', margin: '0 0 20px 0' }}
      >
        <tbody>
          <tr>
            <td style={{ padding: '12px', textAlign: 'center' as const }}>
              <span
                style={{
                  color: '#FFFFFF',
                  fontSize: '13px',
                  fontWeight: 600,
                  letterSpacing: '2px',
                  textTransform: 'uppercase' as const,
                }}
              >
                Emergency Alert
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      <Heading as="h1" style={{ ...styles.heading, fontSize: '22px' }}>
        {alertTitle}
      </Heading>

      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        This is an emergency notification from{' '}
        <strong>{branding.communityName}</strong>.
      </Text>

      <EmailAlert variant="danger">
        {alertBody.split('\n').map((line, i) => (
          <span key={i}>
            {line || '\u00A0'}
            {i < alertBody.split('\n').length - 1 && <br />}
          </span>
        ))}
      </EmailAlert>

      <Text style={{ fontSize: '13px', color: emailColors.mutedForeground, margin: '0 0 20px 0' }}>
        Sent at {sentAt}
      </Text>

      <Hr style={{ borderTop: `1px solid ${emailColors.border}`, margin: '0 0 20px 0' }} />

      <Text style={styles.small}>
        Emergency notifications cannot be unsubscribed.
      </Text>
    </EmailLayout>
  );
}
