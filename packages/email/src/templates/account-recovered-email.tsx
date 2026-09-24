import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, FinePrint, Headline, Paragraph } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface AccountRecoveredEmailProps extends BaseEmailProps {
  recipientName: string;
  portalUrl?: string;
}

/** Layout P5 variant · Account restored — the lifecycle frame with a green result chip instead of a timeline. */
export function AccountRecoveredEmail({ branding, previewText, recipientName, portalUrl }: AccountRecoveredEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      sender="platform"
      tone="green"
      previewText={previewText ?? 'Your account has been restored — you can sign in again'}
      mastheadChip={{ label: 'Restored', tone: 'green' }}
    >
      <CategoryMark icon="user-slate" label="Account lifecycle" tone="neutral" />
      <Headline
        lede={
          <>
            Hi {recipientName} — your account has been successfully restored and your deletion request has been canceled.
          </>
        }
      >
        Account restored
      </Headline>
      <Paragraph>
        Your documents, settings, and access are fully restored. You can sign in again using your previous credentials.
      </Paragraph>
      {portalUrl && <ActionRow href={portalUrl} label="Log in" />}
      <FinePrint>
        If you did not request account recovery, please contact support immediately so we can secure your account.
      </FinePrint>
    </EmailLayout>
  );
}
