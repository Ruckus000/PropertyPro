import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailCard } from '../components/email-card';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface CalendarEventReminderEmailProps extends BaseEmailProps {
  recipientName: string;
  eventLabel: string;
  eventTitle: string;
  reminderTimingLabel: string;
  eventDateLabel: string;
  eventTimeLabel?: string | null;
  detailLines?: string[];
  ctaLabel: string;
  ctaUrl: string;
}

export function CalendarEventReminderEmail({
  branding,
  previewText,
  recipientName,
  eventLabel,
  eventTitle,
  reminderTimingLabel,
  eventDateLabel,
  eventTimeLabel,
  detailLines = [],
  ctaLabel,
  ctaUrl,
}: CalendarEventReminderEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `${eventLabel}: ${eventTitle} on ${eventDateLabel}`}
      accentColor={emailColors.accentBlue}
    >
      <Heading as="h1" style={styles.heading}>
        {eventLabel} reminder
      </Heading>

      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        This is your {reminderTimingLabel.toLowerCase()} reminder for{' '}
        <strong>{eventTitle}</strong> at <strong>{branding.communityName}</strong>.
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
              <td style={styles.labelCell}>Event</td>
              <td style={styles.valueCell}>{eventTitle}</td>
            </tr>
            <tr>
              <td style={styles.labelCell}>When</td>
              <td style={styles.valueCell}>
                {eventDateLabel}
                {eventTimeLabel ? ` at ${eventTimeLabel}` : ''}
              </td>
            </tr>
            {detailLines.map((line) => (
              <tr key={line}>
                <td style={styles.labelCell}>Details</td>
                <td style={styles.valueCell}>{line}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </EmailCard>

      <EmailButton href={ctaUrl}>{ctaLabel}</EmailButton>

      <Text style={styles.smallSpaced}>
        You can change calendar event reminder timing or turn these emails off in your
        notification settings at any time.
      </Text>
    </EmailLayout>
  );
}
