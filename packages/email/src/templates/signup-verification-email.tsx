import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, FinePrint, Headline, PhotoBand } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface SignupVerificationEmailProps extends BaseEmailProps {
  verificationLink: string;
}

/**
 * Layout P7 · Email verification — get one click, then get out of the way. The
 * only platform layout with a photographic band: the one moment the product is
 * selling rather than notifying.
 *
 * Email-first signup sends this before the founder has given a name or a
 * community, so the email carries neither. It also states no lifetime for the
 * link: that is Supabase's email-link expiry, a project setting this code
 * cannot see, and a promised lifetime that outlasts the real one sends the
 * founder to "That sign-in link has expired".
 */
export function SignupVerificationEmail({ branding, previewText, verificationLink }: SignupVerificationEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      sender="platform"
      previewText={previewText ?? 'Verify your email to continue your PropertyPro signup'}
      mastheadContext="PropertyPro Florida"
      footerReason="Sent because a signup was started with this address."
    >
      <PhotoBand image="photo-coast.jpg" alt="Condominium towers along the Florida shoreline" />
      <CategoryMark icon="shield-coral" label="Verify your email" tone="coral" />
      <Headline lede="Thanks for starting your PropertyPro signup. Confirm your email address to continue.">
        Verify your email address
      </Headline>
      <ActionRow href={verificationLink} label="Verify email" />
      <FinePrint>
        The link works once, in the browser where you started signup. If it has expired, go back to the signup page
        and enter your email to get a new one.
      </FinePrint>
    </EmailLayout>
  );
}
