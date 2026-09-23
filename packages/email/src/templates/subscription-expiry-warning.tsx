import { GRACE_EXPIRY_WARNING_OFFSET_DAYS, PAID_GRACE_DAYS } from '@propertypro/shared';
import { EmailLayout } from '../components/email-layout';
import { EmailAlert } from '../components/email-alert';
import { ActionRow, CategoryMark, FinePrint, Headline, ItemRows, SectionLabel, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface SubscriptionLockoutItem {
  /** What is affected, e.g. "Board & manager admin tools". */
  label: string;
  /** What happens to it at lockout, e.g. "Suspended". */
  status: string;
  tone: 'red' | 'green' | 'amber' | 'teal';
}

export interface SubscriptionExpiryWarningEmailProps extends BaseEmailProps {
  recipientName: string;
  expiryDate: string;
  billingPortalUrl: string;
  /** Optional: what stays on / is suspended / is retained at lockout. Rendered only when supplied. */
  atLockout?: SubscriptionLockoutItem[];
}

/** Layout P4 · Subscription expiry — win the renewal without holding an association's records hostage. */
export function SubscriptionExpiryWarningEmail({
  branding,
  previewText,
  recipientName,
  expiryDate,
  billingPortalUrl,
  atLockout,
}: SubscriptionExpiryWarningEmailProps) {
  const lockout = atLockout ?? [];

  return (
    <EmailLayout
      branding={branding}
      sender="platform"
      tone="red"
      previewText={
        previewText ??
        `Access will be locked in ${GRACE_EXPIRY_WARNING_OFFSET_DAYS} days. Update payment to keep your portal active.`
      }
      mastheadContext={`${branding.communityName} · ${PAID_GRACE_DAYS}-day grace period`}
      mastheadChip={{ label: `${GRACE_EXPIRY_WARNING_OFFSET_DAYS} days left`, tone: 'red' }}
    >
      <CategoryMark icon="clock-red" label="Subscription · final reminder" tone="red" />
      <Headline
        lede={
          <>
            Hi {recipientName} — this is a final reminder: portal access for <Strong>{branding.communityName}</Strong> will
            be locked in <Strong>{GRACE_EXPIRY_WARNING_OFFSET_DAYS} days</Strong>, on <Strong>{expiryDate}</Strong>.
          </>
        }
      >
        Access expiring soon
      </Headline>
      <EmailAlert variant="danger" title={`${PAID_GRACE_DAYS}-day grace period ending`}>
        Update payment before {expiryDate} to keep your portal active. After that date, all admin access will be
        suspended. Your data will be retained for 90 days, after which it may be permanently deleted.
      </EmailAlert>
      {lockout.length > 0 && (
        <>
          <SectionLabel icon="lock-slate">At lockout</SectionLabel>
          <ItemRows
            items={lockout.map((item) => ({
              title: item.label,
              status: { tone: item.tone, label: item.status },
            }))}
          />
        </>
      )}
      <ActionRow href={billingPortalUrl} label="Reactivate now" variant="destructive" />
      <FinePrint>
        To restore access, reactivate your subscription before the expiry date. All your community data and settings are
        preserved. Contact support if you need assistance.
      </FinePrint>
    </EmailLayout>
  );
}
