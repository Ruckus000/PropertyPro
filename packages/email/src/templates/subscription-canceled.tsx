import { PAID_GRACE_DAYS } from '@propertypro/shared';
import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, DataRows, FinePrint, Headline, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface SubscriptionCanceledEmailProps extends BaseEmailProps {
  recipientName: string;
  canceledAt: string;
  gracePeriodEndDate: string;
  billingPortalUrl: string;
}

/** Layout P8 · Subscription ended — close the account cleanly and leave the door open. Amber: nothing has gone wrong. */
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
      sender="platform"
      tone="amber"
      previewText={
        previewText ??
        `Your subscription has been canceled — ${PAID_GRACE_DAYS}-day grace period ends ${gracePeriodEndDate}`
      }
      mastheadContext={branding.communityName}
      mastheadChip={{ label: 'Canceled', tone: 'amber' }}
    >
      <CategoryMark icon="clock-amber" label={`Canceled ${canceledAt}`} tone="amber" />
      <Headline
        lede={
          <>
            Hi {recipientName} — the subscription for <Strong>{branding.communityName}</Strong> was canceled on{' '}
            {canceledAt}. You have {PAID_GRACE_DAYS} days of full access, and your community portal will remain accessible
            until <Strong>{gracePeriodEndDate}</Strong>.
          </>
        }
      >
        Subscription canceled
      </Headline>
      <DataRows
        rows={[
          { label: `Full access (${PAID_GRACE_DAYS}-day grace period) until`, value: gracePeriodEndDate },
          { label: 'After that date', value: 'Access restricted · data retained 90 days' },
        ]}
      />
      <ActionRow href={billingPortalUrl} label="Reactivate subscription" variant="warning" />
      <FinePrint>
        To reactivate, click the button above to manage your billing. Your community data and settings are preserved.
        Contact support if you need assistance.
      </FinePrint>
    </EmailLayout>
  );
}
