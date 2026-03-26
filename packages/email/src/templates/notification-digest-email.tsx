import { Heading, Text, Section } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface NotificationDigestItem {
  title: string;
  summary?: string | null;
  actionUrl?: string | null;
}

export interface NotificationDigestEmailProps extends BaseEmailProps {
  recipientName: string;
  frequency: 'daily_digest' | 'weekly_digest';
  items: NotificationDigestItem[];
  portalUrl: string;
}

function getDigestLabel(frequency: NotificationDigestEmailProps['frequency']): string {
  return frequency === 'weekly_digest' ? 'Weekly' : 'Daily';
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
      <Heading as="h1" style={styles.heading}>
        {digestLabel} digest
      </Heading>
      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        Here is what happened this week at{' '}
        <strong>{branding.communityName}</strong>.
      </Text>

      <table
        width="100%"
        cellPadding={0}
        cellSpacing={0}
        style={digestTableStyle}
      >
        <tbody>
          {items.map((item, index) => (
            <tr key={`${item.title}-${index}`}>
              <td style={index < items.length - 1 ? digestItemCell : digestItemCellLast}>
                <p style={itemTitleStyle}>{item.title}</p>
                {item.summary ? (
                  <p style={itemSummaryStyle}>{item.summary}</p>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Section style={styles.buttonSection}>
        <EmailButton href={portalUrl} variant="default">
          Open portal
        </EmailButton>
      </Section>

      <Text style={styles.smallSpaced}>
        You received this digest based on your notification preferences. You can
        update them in your account settings.
      </Text>
    </EmailLayout>
  );
}

const digestTableStyle: React.CSSProperties = {
  border: `1px solid ${emailColors.border}`,
  borderRadius: '6px',
  borderCollapse: 'collapse' as const,
  margin: '0 0 20px 0',
  overflow: 'hidden',
};

const digestItemCell: React.CSSProperties = {
  padding: '12px 16px',
  borderBottom: `1px solid ${emailColors.border}`,
  verticalAlign: 'top' as const,
};

const digestItemCellLast: React.CSSProperties = {
  padding: '12px 16px',
  verticalAlign: 'top' as const,
};

const itemTitleStyle: React.CSSProperties = {
  fontSize: '14px',
  fontWeight: 600,
  color: emailColors.foreground,
  margin: '0 0 3px 0',
};

const itemSummaryStyle: React.CSSProperties = {
  fontSize: '13px',
  color: emailColors.mutedForeground,
  lineHeight: '1.5',
  margin: '0',
};
