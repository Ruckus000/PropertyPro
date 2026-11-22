import { EmailLayout, PLATFORM_SENDER } from '../components/email-layout';
import { CategoryMark, FinePrint, Headline, NumberedRows, Paragraph, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface AccountDeletionExecutedEmailProps extends BaseEmailProps {
  recipientName: string;
  /** When the personal details are erased (6 months after the account was turned off). */
  purgeDate: string;
}

/**
 * Layout P5 variant · Account deleted — the lifecycle timeline with the first
 * stage done and the recovery window dated.
 *
 * Sent when the 30-day cooling period ends and the account is turned off. At
 * that point nothing has been anonymised yet: the name, email and phone number
 * are erased on `purgeDate`, and until then support can restore the account.
 */
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
      previewText={previewText ?? `Your account has been turned off — support can restore it until ${purgeDate}`}
      mastheadChip={{ label: 'Deleted', tone: 'neutral' }}
    >
      <CategoryMark icon="user-slate" label="Account lifecycle" tone="neutral" />
      <Headline
        lede={
          <>
            Hi {recipientName} — the 30 days to cancel have passed, so your account has been turned off as requested. You
            can no longer sign in.
          </>
        }
      >
        Account deleted
      </Headline>
      <NumberedRows
        tone="neutral"
        rows={[
          {
            title: 'Account turned off',
            status: { tone: 'neutral', label: 'Done' },
          },
          {
            title: `Recovery window: until ${purgeDate}`,
            detail: (
              <>
                If you deleted your account by mistake, contact support before <Strong>{purgeDate}</Strong> and we can
                restore it.
              </>
            ),
            status: { tone: 'amber', label: `Until ${purgeDate}` },
          },
          {
            title: `${purgeDate} · personal details erased`,
            detail:
              'Your name, email address and phone number are permanently erased. Records your association must keep stay, shown as “Deleted User”.',
            status: { tone: 'neutral', label: purgeDate, dot: false },
          },
        ]}
      />
      <Paragraph>
        To reach support, email {PLATFORM_SENDER.supportEmail} from this address, so we can tell the request is yours.
      </Paragraph>
      <FinePrint>Thank you for using {branding.communityName}. We are sorry to see you go.</FinePrint>
    </EmailLayout>
  );
}
