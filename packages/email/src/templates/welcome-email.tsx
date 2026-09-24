import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, FinePrint, Headline, NumberedRows, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface WelcomeEmailProps extends BaseEmailProps {
  primaryContactName: string;
  communityName: string;
  loginUrl: string;
}

/**
 * Layout A1 · Welcome — get someone signed in and oriented in a single read.
 * Sent to BOTH newly provisioned admins and move-in residents, so the copy
 * stays audience-neutral.
 */
export function WelcomeEmail({ branding, previewText, primaryContactName, communityName, loginUrl }: WelcomeEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `Welcome to PropertyPro — your ${communityName} portal is ready`}
      mastheadContext="Community portal"
    >
      <CategoryMark icon="dashboard-coral" label="Welcome aboard" tone="coral" />
      <Headline
        lede={
          <>
            Hi {primaryContactName} — the portal for <Strong>{communityName}</Strong> has been set up and is ready to use.
          </>
        }
      >
        Your community portal is open
      </Headline>
      <NumberedRows
        rows={[
          { title: 'Documents and records', detail: 'Governing documents, meeting notices and minutes, in one place.' },
          { title: 'Meetings and announcements', detail: 'Updates from the association as soon as they are posted.' },
          { title: 'Your account', detail: 'Sign in to choose how you hear from us.' },
        ]}
      />
      <ActionRow href={loginUrl} label="Log in to your portal" />
      <FinePrint>If you have questions, reply to this email or contact PropertyPro support.</FinePrint>
    </EmailLayout>
  );
}
