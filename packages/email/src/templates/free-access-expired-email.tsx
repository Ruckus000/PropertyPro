import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, DataRows, FinePrint, Headline, Paragraph, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface FreeAccessExpiredEmailProps extends BaseEmailProps {
  recipientName: string;
  communityName: string;
  subscribeUrl: string;
  graceDaysRemaining: number;
}

/**
 * Layout P8 variant · Free access ended — the subscription-ended frame for a
 * free-access grant. (The design's coverage table pairs this with P4; mapped by
 * meaning: an ended period is P8.)
 */
export function FreeAccessExpiredEmail({
  branding,
  previewText,
  recipientName,
  communityName,
  subscribeUrl,
  graceDaysRemaining,
}: FreeAccessExpiredEmailProps) {
  const dayLabel = `${graceDaysRemaining} day${graceDaysRemaining !== 1 ? 's' : ''}`;

  return (
    <EmailLayout
      branding={branding}
      sender="platform"
      tone="amber"
      previewText={previewText ?? `Your free access to ${communityName} has ended — subscribe to keep access`}
      mastheadContext={communityName}
      mastheadChip={{ label: 'Free access ended', tone: 'amber' }}
    >
      <CategoryMark icon="clock-amber" label="Free access · ended" tone="amber" />
      <Headline
        lede={
          <>
            Hi {recipientName} — your free access to <Strong>{communityName}</Strong> has ended. You have{' '}
            <Strong>{dayLabel}</Strong> remaining in your grace period to subscribe before your access is locked.
          </>
        }
      >
        Free access has ended
      </Headline>
      <DataRows rows={[{ label: 'Grace period remaining', value: dayLabel, tone: 'amber' }]} />
      <Paragraph>Subscribe now to restore full access and continue managing your community without interruption.</Paragraph>
      <ActionRow href={subscribeUrl} label="Subscribe to keep access" variant="warning" />
      <FinePrint>
        After the grace period your account will be locked. Your data will be retained and you can reactivate at any time
        by subscribing.
      </FinePrint>
    </EmailLayout>
  );
}
