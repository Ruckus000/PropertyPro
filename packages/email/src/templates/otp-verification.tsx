import { EmailLayout } from '../components/email-layout';
import { EmailAlert } from '../components/email-alert';
import { CategoryMark, CodeBlock, DataRows, Headline, SectionLabel, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface EmailRequestDetails {
  device?: string;
  location?: string;
  requestedAt?: string;
}

export interface OtpVerificationEmailProps extends BaseEmailProps {
  recipientName: string;
  otpCode: string;
  expiresInMinutes?: number;
  /** Optional: where the request came from, so an unexpected code reads as an attack, not noise. */
  requestDetails?: EmailRequestDetails;
}

/** Layout P1 · Verification code — six digits readable off a lock screen. */
export function OtpVerificationEmail({
  branding,
  previewText,
  recipientName,
  otpCode,
  expiresInMinutes = 10,
  requestDetails,
}: OtpVerificationEmailProps) {
  const minutes = `${expiresInMinutes} minute${expiresInMinutes !== 1 ? 's' : ''}`;
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
      previewText={previewText ?? 'Your verification code'}
      mastheadMeta="One-time code"
      footerReason="Sent to the email address on this request. Security mail cannot be turned off."
    >
      <CategoryMark icon="shield-coral" label="Verify it's you" tone="coral" />
      <Headline
        lede={
          <>
            Hi {recipientName} — enter this code to confirm your email address for <Strong>{branding.communityName}</Strong>.
            It works once.
          </>
        }
      >
        Your verification code
      </Headline>
      <CodeBlock code={otpCode} caption={`This code expires in ${minutes}.`} />
      {details.length > 0 && (
        <>
          <SectionLabel icon="lock-slate">Request details</SectionLabel>
          <DataRows rows={details} />
        </>
      )}
      <EmailAlert variant="info" title="Didn't ask for this?">
        You can safely ignore this email — nothing changes without the code. Never share it with anyone, including
        support.
      </EmailAlert>
    </EmailLayout>
  );
}
