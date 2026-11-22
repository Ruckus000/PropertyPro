import { EmailLayout, PLATFORM_SENDER } from '../components/email-layout';
import { ActionRow, CategoryMark, FinePrint, Headline, Paragraph } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface AccountRecoveredEmailProps extends BaseEmailProps {
  recipientName: string;
  portalUrl?: string;
  /**
   * True when the account had already been turned off (soft-deleted) and
   * support restored it; false when the deletion was stopped during the 30-day
   * cooling period, while the account still worked. Defaults to true.
   */
  wasDeactivated?: boolean;
}

/**
 * Layout P5 variant · Account restored — the lifecycle frame with a green
 * result chip instead of a timeline.
 *
 * The copy never says who stopped the deletion. The account holder can cancel
 * it, but so can a support session acting for them, and only a platform admin
 * can restore a turned-off account — "you cancelled" would be false for two of
 * the three.
 */
export function AccountRecoveredEmail({
  branding,
  previewText,
  recipientName,
  portalUrl,
  wasDeactivated = true,
}: AccountRecoveredEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      sender="platform"
      tone="green"
      previewText={
        previewText ??
        (wasDeactivated
          ? 'Your account has been restored — you can sign in again'
          : 'Your account will not be deleted')
      }
      mastheadChip={{ label: wasDeactivated ? 'Restored' : 'Not deleted', tone: 'green' }}
    >
      <CategoryMark icon="user-slate" label="Account lifecycle" tone="neutral" />
      {wasDeactivated ? (
        <>
          <Headline
            lede={
              <>Hi {recipientName} — your account has been restored and is no longer scheduled for deletion.</>
            }
          >
            Account restored
          </Headline>
          <Paragraph>
            You can sign in again with your existing email address and password. Visitor passes that were cancelled when
            the account was turned off stay cancelled; create new ones if you still need them.
          </Paragraph>
        </>
      ) : (
        <>
          <Headline lede={<>Hi {recipientName} — the request to delete your account has been cancelled.</>}>
            Account deletion cancelled
          </Headline>
          <Paragraph>Nothing else changes: your account stays open and you can keep signing in as usual.</Paragraph>
        </>
      )}
      {portalUrl && <ActionRow href={portalUrl} label="Sign in" />}
      <FinePrint>
        If you did not expect this email, contact {PLATFORM_SENDER.supportEmail} so we can secure your account.
      </FinePrint>
    </EmailLayout>
  );
}
