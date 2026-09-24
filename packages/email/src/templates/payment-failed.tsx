import { EmailLayout } from '../components/email-layout';
import {
  ActionRow,
  CategoryMark,
  DataRows,
  Figure,
  FinePrint,
  Headline,
  SectionLabel,
  Strong,
} from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface PaymentRetryStep {
  label: string;
  value: string;
}

export interface PaymentFailedEmailProps extends BaseEmailProps {
  recipientName: string;
  /**
   * The formatted amount of the failed invoice, or null when the caller does not
   * know it (e.g. the Day 3/7 reminder cron, which stores no invoice amount).
   * Null omits the figure rather than printing a placeholder as a balance.
   */
  amountDue: string | null;
  lastFourDigits: string | null;
  billingPortalUrl: string;
  /** Optional: the Stripe invoice number, shown in the category mark. */
  invoiceNumber?: string;
  /** Optional: the plan name, shown under the PropertyPro lockup. */
  planLabel?: string;
  /** Optional: the real retry / lockout schedule ("What happens next"). Rendered only when supplied. */
  retrySchedule?: PaymentRetryStep[];
}

/** Layout P3 · Payment failed — fix a card without frightening a volunteer board treasurer. */
export function PaymentFailedEmail({
  branding,
  previewText,
  recipientName,
  amountDue,
  lastFourDigits,
  billingPortalUrl,
  invoiceNumber,
  planLabel,
  retrySchedule,
}: PaymentFailedEmailProps) {
  const schedule = retrySchedule ?? [];

  return (
    <EmailLayout
      branding={branding}
      sender="platform"
      tone="red"
      previewText={previewText ?? (amountDue ? `Action required: Payment of ${amountDue} failed` : 'Action required: A payment failed')}
      mastheadContext={planLabel ? `${branding.communityName} · ${planLabel}` : branding.communityName}
      mastheadChip={{ label: 'Action needed', tone: 'red' }}
    >
      <CategoryMark icon="money-red" label={invoiceNumber ? `Billing · invoice ${invoiceNumber}` : 'Billing'} tone="red" />
      <Headline
        lede={
          <>
            Hi {recipientName} — we were unable to process{' '}
            {amountDue ? (
              <>
                a payment of <Strong>{amountDue}</Strong>
              </>
            ) : (
              'your latest payment'
            )}{' '}
            for <Strong>{branding.communityName}</Strong>. Your account remains active for now. Please update your payment
            method to avoid service interruption.
          </>
        }
      >
        Payment failed
      </Headline>
      {amountDue && (
        <Figure
          label="Outstanding balance"
          icon="money-slate"
          amount={amountDue}
          tone="red"
          asideLabel={lastFourDigits ? 'Card on file' : undefined}
          asideValue={lastFourDigits ? `ending in ${lastFourDigits}` : undefined}
        />
      )}
      {schedule.length > 0 && (
        <>
          <SectionLabel icon="clock-slate">What happens next</SectionLabel>
          <DataRows rows={schedule} />
        </>
      )}
      <ActionRow href={billingPortalUrl} label="Update payment method" variant="destructive" />
      <FinePrint>
        If you believe this is an error, please contact your payment provider. This link will generate a fresh billing
        portal session.
      </FinePrint>
    </EmailLayout>
  );
}
