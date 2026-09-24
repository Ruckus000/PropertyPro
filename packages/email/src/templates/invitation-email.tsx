import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, DataRows, FinePrint, Headline, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface InvitationEmailProps extends BaseEmailProps {
  inviteeName: string;
  inviterName: string;
  role: string;
  inviteUrl: string;
  expiresInDays?: number;
}

/**
 * Layout A1 · Welcome (invitation variant) — get someone from "who is this?"
 * to an accepted invite in one read: who asked, for which community, in what
 * role, and how long the link lasts.
 */
export function InvitationEmail({
  branding,
  previewText,
  inviteeName,
  inviterName,
  role,
  inviteUrl,
  expiresInDays = 7,
}: InvitationEmailProps) {
  const expirationText = `${expiresInDays} day${expiresInDays !== 1 ? 's' : ''}`;

  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `You've been invited to join ${branding.communityName}`}
      mastheadContext="Community portal"
    >
      <CategoryMark icon="dashboard-coral" label="Invitation" tone="coral" />
      <Headline
        lede={
          <>
            Hi {inviteeName} — {inviterName} has invited you to join <Strong>{branding.communityName}</Strong> as a{' '}
            <Strong>{role}</Strong>.
          </>
        }
      >
        You&apos;ve been invited
      </Headline>
      <DataRows
        rows={[
          { label: 'Community', value: branding.communityName },
          { label: 'Invited by', value: inviterName },
          { label: 'Your role', value: role },
        ]}
      />
      <ActionRow href={inviteUrl} label="Accept invitation" aside={`Expires in ${expirationText}`} />
      <FinePrint>
        This invitation expires in {expirationText}. If you did not expect this invitation, you can safely ignore this
        email.
      </FinePrint>
    </EmailLayout>
  );
}
