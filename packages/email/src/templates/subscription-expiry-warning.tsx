import { Heading, Text } from '@react-email/components';
import {
  GRACE_EXPIRY_WARNING_OFFSET_DAYS,
  PAID_GRACE_DAYS,
} from '@propertypro/shared';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailAlert } from '../components/email-alert';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface SubscriptionExpiryWarningEmailProps extends BaseEmailProps {
  recipientName: string;
  expiryDate: string;
  billingPortalUrl: string;
}

export function SubscriptionExpiryWarningEmail({
  branding,
  previewText,
  recipientName,
  expiryDate,
  billingPortalUrl,
}: SubscriptionExpiryWarningEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        `Access will be locked in ${GRACE_EXPIRY_WARNING_OFFSET_DAYS} days. Update payment to keep your portal active.`
      }
      accentColor={emailColors.accentRed}
    >
      <Heading as="h1" style={styles.heading}>
        Access expiring soon
      </Heading>

      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        This is a final reminder: portal access for{' '}
        <strong>{branding.communityName}</strong> will be locked in{' '}
        <strong>{GRACE_EXPIRY_WARNING_OFFSET_DAYS} days</strong>, on{' '}
        <strong>{expiryDate}</strong>.
      </Text>

      <EmailAlert variant="danger" title={`${PAID_GRACE_DAYS}-day grace period ending`}>
        Update payment before {expiryDate} to keep your portal active. After
        that date, all admin access will be suspended. Your data will be
        retained for 90 days, after which it may be permanently deleted.
      </EmailAlert>

      <EmailButton href={billingPortalUrl} variant="destructive">
        Reactivate now
      </EmailButton>

      <Text style={styles.smallSpaced}>
        To restore access, reactivate your subscription before the expiry date.
        All your community data and settings are preserved. Contact support if
        you need assistance.
      </Text>
    </EmailLayout>
  );
}
