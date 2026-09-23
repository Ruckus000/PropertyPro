import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, FinePrint, Headline, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface FreeAccessExpiringEmailProps extends BaseEmailProps {
  recipientName: string;
  communityName: string;
  daysRemaining: number;
  subscribeUrl: string;
}

/**
 * Layout P4 variant · Free access expiring — the expiry frame for a free-access
 * grant. (The design's coverage table pairs this with P8; mapped by meaning: an
 * approaching deadline is P4, an ended one is P8.)
 */
export function FreeAccessExpiringEmail({
  branding,
  previewText,
  recipientName,
  communityName,
  daysRemaining,
  subscribeUrl,
}: FreeAccessExpiringEmailProps) {
  const dayLabel = `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''}`;

  return (
    <EmailLayout
      branding={branding}
      sender="platform"
      tone="red"
      previewText={previewText ?? `Your free access to ${communityName} ends in ${dayLabel}`}
      mastheadContext={communityName}
      mastheadChip={{ label: `${dayLabel} left`, tone: 'red' }}
    >
      <CategoryMark icon="clock-red" label="Free access · ending soon" tone="red" />
      <Headline
        lede={
          <>
            Hi {recipientName} — your free access to <Strong>{communityName}</Strong> ends in <Strong>{dayLabel}</Strong>.
            Subscribe now to continue uninterrupted access to your community portal.
          </>
        }
      >
        Free access ending soon
      </Headline>
      <ActionRow href={subscribeUrl} label="Subscribe now" variant="destructive" />
      <FinePrint>
        After the free access period ends, a 30-day grace period begins before your account is locked. Subscribe at any
        time to keep access.
      </FinePrint>
    </EmailLayout>
  );
}
