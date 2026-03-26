import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailAlert } from '../components/email-alert';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

export interface PaymentFailedEmailProps extends BaseEmailProps {
  recipientName: string;
  amountDue: string;
  lastFourDigits: string | null;
  billingPortalUrl: string;
}

export function PaymentFailedEmail({
  branding,
  previewText,
  recipientName,
  amountDue,
  lastFourDigits,
  billingPortalUrl,
}: PaymentFailedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `Action required: Payment of ${amountDue} failed`}
      accentColor={emailColors.accentRed}
    >
      <Heading as="h1" style={styles.heading}>
        Payment failed
      </Heading>

      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        We were unable to process a payment of <strong>{amountDue}</strong> for{' '}
        <strong>{branding.communityName}</strong>
        {lastFourDigits ? ` ending in ${lastFourDigits}` : ''}.
      </Text>

      <EmailAlert variant="danger">
        Your account remains active for now. Please update your payment method
        to avoid service interruption. Outstanding balance:{' '}
        <strong>{amountDue}</strong>.
      </EmailAlert>

      <EmailButton href={billingPortalUrl} variant="destructive">
        Update payment method
      </EmailButton>

      <Text style={styles.smallSpaced}>
        If you believe this is an error, please contact your payment provider.
        This link will generate a fresh billing portal session.
      </Text>
    </EmailLayout>
  );
}
