import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailAlert } from '../components/email-alert';
import * as styles from '../components/shared-styles';
import type { BaseEmailProps } from '../types';

/**
 * Sent once, at the moment the paid grace window ends.
 *
 * Deliberately NOT SubscriptionExpiryWarningEmail with a different subject.
 * That template is entirely future-tense — "will be locked in N days, on
 * {date}", "update payment before {date} to keep your portal active" — and by
 * the time this notice fires, {date} has already passed and access is already
 * suspended. Reusing it tells a churned customer to beat a deadline that is
 * gone, at the one moment the message needs to be credible.
 *
 * SubscriptionCanceledEmail is future-tense for the same reason ("grace period
 * ends {date}. After that date, access will be restricted"), so it does not fit
 * either.
 *
 * `lockedSinceDate` is therefore stated as a past fact, not a deadline.
 */
export interface SubscriptionLapsedEmailProps extends BaseEmailProps {
  recipientName: string;
  /** The grace-end date, already in the past when this sends. */
  lockedSinceDate: string;
  billingPortalUrl: string;
}

export function SubscriptionLapsedEmail({
  branding,
  previewText,
  recipientName,
  lockedSinceDate,
  billingPortalUrl,
}: SubscriptionLapsedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={
        previewText ??
        'Admin access is now paused. Reactivate any time to restore it.'
      }
      accentColor={emailColors.accentRed}
    >
      <Heading as="h1" style={styles.heading}>
        Admin access is paused
      </Heading>

      <Text style={styles.body}>Hi {recipientName},</Text>
      <Text style={styles.body}>
        The grace period for <strong>{branding.communityName}</strong> ended on{' '}
        <strong>{lockedSinceDate}</strong>, so administrator access to the
        portal is now paused.
      </Text>

      <EmailAlert variant="danger" title="Nothing has been deleted">
        Your community&apos;s documents, meetings and records are all still
        there, and residents can still sign in. Reactivating restores full
        administrator access immediately.
      </EmailAlert>

      <EmailButton href={billingPortalUrl} variant="destructive">
        Reactivate subscription
      </EmailButton>

      <Text style={styles.smallSpaced}>
        Your community data and settings are retained for 90 days from the date
        above. Contact support if you need assistance.
      </Text>
    </EmailLayout>
  );
}
