import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, FinePrint, Headline, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface AccessRequestApprovedEmailProps extends BaseEmailProps {
  recipientName: string;
  loginUrl: string;
}

/**
 * Layout A9 · Access request (approved) — the pending layout with a green
 * result chip in place of the review actions, and one action: sign in.
 */
export function AccessRequestApprovedEmail({
  branding,
  previewText,
  recipientName,
  loginUrl,
}: AccessRequestApprovedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      tone="green"
      previewText={previewText ?? 'Your access request has been approved'}
      mastheadContext="Resident portal"
      mastheadChip={{ label: 'Approved', tone: 'green' }}
    >
      <CategoryMark icon="user-teal" label="Access request" tone="teal" />
      <Headline
        lede={
          <>
            Hi {recipientName} — your request to join <Strong>{branding.communityName}</Strong> has been approved. You
            now have full access to the resident portal.
          </>
        }
      >
        Access request approved
      </Headline>
      <ActionRow href={loginUrl} label="Log in" variant="teal" />
      <FinePrint>If you have any questions, please contact your community manager.</FinePrint>
    </EmailLayout>
  );
}
