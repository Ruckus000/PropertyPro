import { EmailLayout } from '../components/email-layout';
import { EmailAlert } from '../components/email-alert';
import { ActionRow, CategoryMark, FinePrint, Headline, Strong } from '../components/email-blocks';
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
 *
 * Layout P4 variant · the expiry frame after the deadline: the chip states the
 * paused state instead of a countdown.
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
      sender="platform"
      tone="red"
      previewText={previewText ?? 'Admin access is now paused. Reactivate any time to restore it.'}
      mastheadContext={branding.communityName}
      mastheadChip={{ label: 'Admin access paused', tone: 'red' }}
    >
      <CategoryMark icon="clock-red" label={`Subscription lapsed · ${lockedSinceDate}`} tone="red" />
      <Headline
        lede={
          <>
            Hi {recipientName} — the grace period for <Strong>{branding.communityName}</Strong> ended on{' '}
            <Strong>{lockedSinceDate}</Strong>, so administrator access to the portal is now paused.
          </>
        }
      >
        Admin access is paused
      </Headline>
      <EmailAlert variant="info" title="Nothing has been deleted">
        Your community&apos;s documents, meetings and records are all still there, and residents can still sign in.
        Reactivating restores full administrator access immediately.
      </EmailAlert>
      <ActionRow href={billingPortalUrl} label="Reactivate subscription" variant="destructive" />
      <FinePrint>
        Your community data and settings are retained for 90 days from the date above. Contact support if you need
        assistance.
      </FinePrint>
    </EmailLayout>
  );
}
