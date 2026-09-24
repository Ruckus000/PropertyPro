import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, FinePrint, Headline, NumberedRows, Paragraph } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface AccountDeletionInitiatedEmailProps extends BaseEmailProps {
  recipientName: string;
  coolingEndDate: string;
  purgeDate: string;
  cancelUrl: string;
}

/**
 * Layout P5 · Account lifecycle — make an irreversible action feel reversible
 * for as long as it is. Neutral accent, not red: this is the user's own
 * decision. The three stages carry their real dates, so "30 days" is a
 * calendar rather than a promise.
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
      previewText={previewText ?? 'Account deletion has been initiated — you can cancel within 30 days'}
      mastheadMeta="Account deletion requested"
    >
      <CategoryMark icon="user-slate" label="Account lifecycle" tone="neutral" />
      <Headline
        lede={<>Hi {recipientName} — we have received a request to delete your account. Here is what happens next:</>}
      >
        Account deletion initiated
      </Headline>
      <NumberedRows
        tone="neutral"
        rows={[
          {
            title: 'Days 1–7 · cooling off',
            detail: 'Account stays active. Cancel anytime.',
            status: { tone: 'green', label: 'Active now' },
          },
          {
            title: 'Days 8–30 · recovery window',
            detail: 'Account deactivated, data preserved.',
            status: { tone: 'neutral', label: `From ${coolingEndDate}`, dot: false },
          },
          {
            title: 'After day 30 · permanent purge',
            detail: 'All personal data permanently deleted.',
            status: { tone: 'neutral', label: purgeDate, dot: false },
          },
        ]}
      />
      <Paragraph tight>Changed your mind?</Paragraph>
      <ActionRow href={cancelUrl} label="Cancel deletion" variant="neutral" />
      <FinePrint>
        If you did not request account deletion, please cancel immediately and contact support. This action was initiated
        from your account settings.
      </FinePrint>
    </EmailLayout>
  );
}
