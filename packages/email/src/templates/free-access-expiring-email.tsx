import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface FreeAccessExpiringEmailProps extends BaseEmailProps {
  recipientName: string;
  communityName: string;
  daysRemaining: number;
  subscribeUrl: string;
}

export function FreeAccessExpiringEmail({
  branding,
  previewText,
  recipientName,
  communityName,
  daysRemaining,
  subscribeUrl,
}: FreeAccessExpiringEmailProps) {
  const dayLabel = `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`;

  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `Your free access to ${communityName} ends in ${dayLabel}`
      }
      accentColor={emailColors.accentWarning}
    >
      <Heading as="h1" style={styles.heading}>
        Free access ending soon
      </Heading>

      <Text style={styles.body}>Hi {recipientName},</Text>

      <Text style={styles.body}>
        Your free access to <strong>{communityName}</strong> ends in{' '}
        <strong>{dayLabel}</strong>. Subscribe now to continue uninterrupted
        access to your community portal.
      </Text>

      <EmailButton href={subscribeUrl} variant="default">
        Subscribe now
      </EmailButton>

      <Text style={styles.smallSpaced}>
        After the free access period ends, a 30-day grace period begins before
        your account is locked. Subscribe at any time to keep access.
      </Text>
    </EmailLayout>
  );
}
