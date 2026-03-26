import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailAlert } from '../components/email-alert';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface SubscriptionCanceledEmailProps extends BaseEmailProps {
  recipientName: string;
  canceledAt: string;
  gracePeriodEndDate: string;
  billingPortalUrl: string;
}

export function SubscriptionCanceledEmail({
  branding,
  previewText,
  recipientName,
  canceledAt,
  gracePeriodEndDate,
  billingPortalUrl,
}: SubscriptionCanceledEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `Your subscription has been canceled — 30-day grace period ends ${gracePeriodEndDate}`
      }
      accentColor={emailColors.accentWarning}
    >
      <Heading as="h1" style={styles.heading}>
        Subscription canceled
      </Heading>

      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        The subscription for <strong>{branding.communityName}</strong> was
        canceled on {canceledAt}.
      </Text>

      <EmailAlert variant="warning" title="30-day grace period">
        Your community portal will remain accessible until{' '}
        <strong>{gracePeriodEndDate}</strong>. After that date, access will be
        restricted and your data will be retained for 90 days.
      </EmailAlert>

      <EmailButton href={billingPortalUrl} variant="default">
        Reactivate subscription
      </EmailButton>

      <Text style={styles.smallSpaced}>
        To reactivate, click the button above to manage your billing. Your
        community data and settings are preserved. Contact support if you need
        assistance.
      </Text>
    </EmailLayout>
  );
}
