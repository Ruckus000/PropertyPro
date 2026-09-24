import { EmailLayout } from '../components/email-layout';
import { CategoryMark, FinePrint, Headline, NumberedRows, Paragraph, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface AccountDeletionExecutedEmailProps extends BaseEmailProps {
  recipientName: string;
  purgeDate: string;
}

/** Layout P5 variant · Account deleted — the lifecycle timeline with the first stage done and the recovery window dated. */
export function AccountDeletionExecutedEmail({
  branding,
  previewText,
  recipientName,
  purgeDate,
}: AccountDeletionExecutedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      sender="platform"
      tone="neutral"
      previewText={previewText ?? 'Your account has been deleted'}
      mastheadChip={{ label: 'Deleted', tone: 'neutral' }}
    >
      <CategoryMark icon="user-slate" label="Account lifecycle" tone="neutral" />
      <Headline
        lede={
          <>
            Hi {recipientName} — your account has been deactivated as requested. You can no longer sign in with your
            previous credentials.
          </>
        }
      >
        Account deleted
      </Headline>
      <NumberedRows
        tone="neutral"
        rows={[
          {
            title: 'Account deactivated',
            status: { tone: 'neutral', label: 'Done' },
          },
          {
            title: `Recovery window: until ${purgeDate}`,
            detail: (
              <>
                Your anonymised account record is retained until <Strong>{purgeDate}</Strong>. If you deleted your account by
                mistake, contact our support team before that date to request recovery.
              </>
            ),
            status: { tone: 'amber', label: `Until ${purgeDate}` },
          },
        ]}
      />
      <Paragraph>
        To reach support, reply to this email or visit our help centre. Please have this email on hand as proof of your
        identity.
      </Paragraph>
      <FinePrint>Thank you for using {branding.communityName}. We are sorry to see you go.</FinePrint>
    </EmailLayout>
  );
}
