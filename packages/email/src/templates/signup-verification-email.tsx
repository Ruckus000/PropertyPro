import { EmailLayout } from '../components/email-layout';
import {
  ActionRow,
  CategoryMark,
  DataRows,
  FinePrint,
  Headline,
  PhotoBand,
  SectionLabel,
  Strong,
} from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface SignupRemainingStep {
  label: string;
  value: string;
}

export interface SignupVerificationEmailProps extends BaseEmailProps {
  primaryContactName: string;
  communityName: string;
  verificationLink: string;
  /** Optional: the signup steps still ahead ("What's left"). Rendered only when supplied. */
  remainingSteps?: SignupRemainingStep[];
}

/**
 * Layout P7 · Email verification — get one click, then get out of the way. The
 * only platform layout with a photographic band: the one moment the product is
 * selling rather than notifying.
 */
export function SignupVerificationEmail({
  branding,
  previewText,
  primaryContactName,
  communityName,
  verificationLink,
  remainingSteps,
}: SignupVerificationEmailProps) {
  const steps = remainingSteps ?? [];

  return (
    <EmailLayout
      branding={branding}
      sender="platform"
      previewText={previewText ?? 'Verify your email to continue your PropertyPro signup'}
      mastheadContext={communityName}
      footerReason="Sent because a signup was started with this address."
    >
      <PhotoBand image="photo-coast.jpg" alt="Condominium towers along the Florida shoreline" />
      <CategoryMark icon="shield-coral" label="Verify your email" tone="coral" />
      <Headline
        lede={
          <>
            Hi {primaryContactName} — thanks for starting signup for <Strong>{communityName}</Strong>. Confirm your email
            address to finish setting up your account.
          </>
        }
      >
        Verify your email address
      </Headline>
      <ActionRow href={verificationLink} label="Verify email" aside="Link valid 24 hours" />
      {steps.length > 0 && (
        <>
          <SectionLabel icon="clock-slate">What&apos;s left</SectionLabel>
          <DataRows rows={steps} />
        </>
      )}
      <FinePrint>For security, checkout stays locked until verification is complete. This link expires in 24 hours.</FinePrint>
    </EmailLayout>
  );
}
