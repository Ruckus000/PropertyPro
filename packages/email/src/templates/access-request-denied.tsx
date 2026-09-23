import { EmailLayout } from '../components/email-layout';
import { CategoryMark, FinePrint, Headline, Paragraph, Quote, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface AccessRequestDeniedEmailProps extends BaseEmailProps {
  recipientName: string;
  reason?: string;
}

/**
 * Layout A9 · Access request (denied) — the pending layout with a neutral
 * result chip and no actions. The administrator's reason, when given, is
 * quoted in their words: a denial is a path with words, not a bare refusal.
 */
export function AccessRequestDeniedEmail({ branding, previewText, recipientName, reason }: AccessRequestDeniedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      tone="neutral"
      previewText={previewText ?? 'Update on your access request'}
      mastheadContext="Resident portal"
      mastheadChip={{ label: 'Not approved', tone: 'neutral' }}
    >
      <CategoryMark icon="user-teal" label="Access request" tone="teal" />
      <Headline
        lede={
          <>
            Hi {recipientName} — your request to join <Strong>{branding.communityName}</Strong> was not approved at
            this time.
          </>
        }
      >
        Access request update
      </Headline>
      {reason && <Quote attribution="Reason given by the association">{reason}</Quote>}
      <Paragraph>
        If you believe this is an error or have questions, please contact your community administrator directly.
      </Paragraph>
      <FinePrint>This is an automated message. Please do not reply to this email.</FinePrint>
    </EmailLayout>
  );
}
