import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface FreeAccessExpiredEmailProps extends BaseEmailProps {
  recipientName: string;
  communityName: string;
  subscribeUrl: string;
  graceDaysRemaining: number;
}

export function FreeAccessExpiredEmail({
  branding,
  previewText,
  recipientName,
  communityName,
  subscribeUrl,
  graceDaysRemaining,
}: FreeAccessExpiredEmailProps) {
  const dayLabel = `${graceDaysRemaining} day${graceDaysRemaining !== 1 ? 's' : ''}`;

  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `Your free access to ${communityName} has ended — subscribe to keep access`
      }
      accentColor={emailColors.accentRed}
    >
      <Heading as="h1" style={styles.heading}>
        Free access has ended
      </Heading>

      <Text style={styles.body}>Hi {recipientName},</Text>

      <Text style={styles.body}>
        Your free access to <strong>{communityName}</strong> has ended. You
        have <strong>{dayLabel}</strong> remaining in your grace period to
        subscribe before your access is locked.
      </Text>

      <Text style={styles.body}>
        Subscribe now to restore full access and continue managing your
        community without interruption.
      </Text>

      <EmailButton href={subscribeUrl} variant="destructive">
        Subscribe to keep access
      </EmailButton>

      <Text style={styles.smallSpaced}>
        After the grace period your account will be locked. Your data will be
        retained and you can reactivate at any time by subscribing.
      </Text>
    </EmailLayout>
  );
}
