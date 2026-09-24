import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, DataRows, FinePrint, Headline, SectionLabel, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';
import type { EmailRequestDetails } from './otp-verification';

export interface PasswordResetEmailProps extends BaseEmailProps {
  userName: string;
  resetUrl: string;
  expiresInMinutes?: number;
  /** Optional: where the request came from, so an unexpected reset reads as an attack, not noise. */
  requestDetails?: EmailRequestDetails;
}

/** Layout P2 · Password reset — let the right person back in, and let the wrong one learn nothing. */
export function PasswordResetEmail({
  branding,
  previewText,
  userName,
  resetUrl,
  expiresInMinutes = 60,
  requestDetails,
}: PasswordResetEmailProps) {
  const expirationText = `${expiresInMinutes} minute${expiresInMinutes !== 1 ? 's' : ''}`;
  const details = requestDetails
    ? [
        { label: 'Device', value: requestDetails.device },
        { label: 'Approximate location', value: requestDetails.location },
        { label: 'Requested', value: requestDetails.requestedAt },
      ].filter((row) => row.value)
    : [];

  return (
    <EmailLayout
      branding={branding}
      sender="platform"
      previewText={previewText ?? 'Reset your password'}
      mastheadMeta="Account security"
      footerReason="Sent because a password reset was requested for this address."
    >
      <CategoryMark icon="lock-coral" label="Password reset" tone="coral" />
      <Headline
        lede={
          <>
            Hi {userName} — we received a request to reset the password for your <Strong>{branding.communityName}</Strong>{' '}
            account. Choose a new password below.
          </>
        }
      >
        Reset your password
      </Headline>
      <ActionRow href={resetUrl} label="Reset password" aside={`Expires in ${expirationText}`} />
      {details.length > 0 && (
        <>
          <SectionLabel icon="lock-slate">Where the request came from</SectionLabel>
          <DataRows rows={details} />
        </>
      )}
      <FinePrint>
        This link expires in {expirationText}. If you did not request a password reset, you can safely ignore this email.
        Your password will not be changed.
      </FinePrint>
    </EmailLayout>
  );
}
