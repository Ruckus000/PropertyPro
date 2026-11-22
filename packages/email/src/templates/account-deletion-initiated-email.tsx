import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, FinePrint, Headline, NumberedRows, Paragraph } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface AccountDeletionInitiatedEmailProps extends BaseEmailProps {
  recipientName: string;
  /** End of the 30-day cooling period: the day the account is turned off. */
  coolingEndDate: string;
  /** About 6 months after `coolingEndDate`: the day personal details are erased. */
  purgeDate: string;
  cancelUrl: string;
}

/**
 * Layout P5 · Account lifecycle — make an irreversible action feel reversible
 * for as long as it is. Neutral accent, not red: this is the user's own
 * decision. The three stages carry their real dates, so "30 days" is a
 * calendar rather than a promise.
 *
 * The stages are the ones the lifecycle cron runs (apps/web
 * `lib/account-lifecycle/deletion-timeline.ts`): 30 days in which the account
 * keeps working and the user can cancel; then the account is turned off and
 * only support can restore it; 6 months later the personal details are erased.
 * Association records are not erased, so the copy does not say "all data".
 */
export function AccountDeletionInitiatedEmail({
  branding,
  previewText,
  recipientName,
  coolingEndDate,
  purgeDate,
  cancelUrl,
}: AccountDeletionInitiatedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      sender="platform"
      tone="neutral"
      previewText={previewText ?? `Your account will be deleted on ${coolingEndDate} — you can cancel until then`}
      mastheadMeta="Account deletion requested"
    >
      <CategoryMark icon="user-slate" label="Account lifecycle" tone="neutral" />
      <Headline
        lede={<>Hi {recipientName} — we have received a request to delete your PropertyPro account. Here is what happens next:</>}
      >
        Account deletion initiated
      </Headline>
      <NumberedRows
        tone="neutral"
        rows={[
          {
            title: `Until ${coolingEndDate} · you can cancel`,
            detail: 'Your account keeps working. Cancel any time from Account Settings.',
            status: { tone: 'green', label: 'Active now' },
          },
          {
            title: `${coolingEndDate} · account turned off`,
            detail: `You can no longer sign in. Until ${purgeDate}, only support can restore the account.`,
            status: { tone: 'neutral', label: `From ${coolingEndDate}`, dot: false },
          },
          {
            title: `${purgeDate} · personal details erased`,
            detail:
              'Your name, email address and phone number are permanently erased. Records your association must keep stay, shown as “Deleted User”.',
            status: { tone: 'neutral', label: purgeDate, dot: false },
          },
        ]}
      />
      <Paragraph tight>Changed your mind? You can cancel until {coolingEndDate}.</Paragraph>
      <ActionRow href={cancelUrl} label="Cancel deletion" variant="neutral" />
      <FinePrint>
        If you did not request account deletion, cancel it now, change your password, and contact support. The request
        was made from Account Settings after your password was entered.
      </FinePrint>
    </EmailLayout>
  );
}
