import { EmailLayout } from '../components/email-layout';
import { EmailAlert } from '../components/email-alert';
import { ActionRow, CategoryMark, Figure, FinePrint, Headline, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

/**
 * Sent on Stripe's `invoice.payment_action_required` — the bank wants 3-D Secure
 * before it will take an off-session renewal.
 *
 * A separate template from `PaymentFailedEmail`, not a `variant` prop on it,
 * because the two say opposite things. Nothing has failed here: the charge is
 * waiting on the cardholder, the saved card is fine, and "update your payment
 * method" is actively wrong advice — following it does not clear the
 * authentication and costs the association a re-entered card for no reason.
 * Sharing one template would give that file two reasons to change.
 *
 * Timing is the whole point. Stripe fires this BEFORE the payment gives up and
 * the subscription goes `past_due`, so this email is the only window in which a
 * board can act while the renewal can still succeed. That is why it leads with
 * the authenticate link rather than the billing portal — the portal cannot
 * complete a 3-D Secure challenge.
 *
 * Layout P3 variant · the payment-failed frame in amber, not red: the same
 * amount object, but the state is "waiting on you", not "failed".
 */
export interface AuthenticateCardEmailProps extends BaseEmailProps {
  recipientName: string;
  amountDue: string;
  /**
   * Stripe's `invoice.hosted_invoice_url` — the page that runs the 3-D Secure
   * challenge.
   *
   * Treat as bearer-ish: possession of it is enough to view and pay the
   * invoice, so it belongs in the email body and nowhere else. It must never
   * reach a log line, an audit-log payload, or an error message.
   *
   * The caller substitutes the billing-portal URL when Stripe supplied none.
   */
  authenticateUrl: string;
  /** Secondary link, for managing billing rather than clearing this charge. */
  billingPortalUrl: string;
}

export function AuthenticateCardEmail({
  branding,
  previewText,
  recipientName,
  amountDue,
  authenticateUrl,
  billingPortalUrl,
}: AuthenticateCardEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      sender="platform"
      tone="amber"
      previewText={previewText ?? `Confirm your bank's security check to complete ${amountDue}`}
      mastheadContext={branding.communityName}
      mastheadChip={{ label: 'Confirmation needed', tone: 'amber' }}
    >
      <CategoryMark icon="money-slate" label="Billing · bank security check" tone="amber" />
      <Headline
        lede={
          <>
            Hi {recipientName} — your renewal of <Strong>{amountDue}</Strong> for <Strong>{branding.communityName}</Strong>{' '}
            is ready to go through, but your bank has asked for an extra security check before it will approve the charge.
          </>
        }
      >
        Your bank needs you to confirm this payment
      </Headline>
      <Figure label="Renewal awaiting confirmation" icon="money-slate" amount={amountDue} tone="amber" />
      <EmailAlert variant="warning" title="Nothing has gone wrong with your card">
        There is no need to replace it. The payment simply cannot complete until someone confirms it with the bank. If it
        is not confirmed, the renewal will fail on its own and the subscription will fall into arrears.
      </EmailAlert>
      <ActionRow
        href={authenticateUrl}
        label="Confirm this payment"
        variant="warning"
        secondary={{ href: billingPortalUrl, label: 'Manage billing' }}
      />
      <FinePrint>
        The button takes you to Stripe to complete the check. Anyone with that link can view and pay the invoice, so please
        don&apos;t forward this email. The secondary link opens your billing portal.
      </FinePrint>
    </EmailLayout>
  );
}
