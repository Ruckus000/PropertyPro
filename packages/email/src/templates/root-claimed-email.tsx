import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, FinePrint, Headline, Paragraph, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface RootClaimedEmailProps extends BaseEmailProps {
  claimantName: string;
  communityName: string;
  disputeUrl: string;
}

/** Layout P7 variant · Root manager claimed — the verification frame without the photo: confirm, or dispute in one click. */
export function RootClaimedEmail({ branding, previewText, claimantName, communityName, disputeUrl }: RootClaimedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      sender="platform"
      previewText={previewText ?? `${claimantName} is now the root manager of ${communityName}`}
      mastheadContext={communityName}
    >
      <CategoryMark icon="shield-coral" label="Root manager claimed" tone="coral" />
      <Headline
        lede={
          <>
            <Strong>{claimantName}</Strong> is now the root manager of <Strong>{communityName}</Strong>. The root manager has
            full administrative control over this community.
          </>
        }
      >
        Root manager claimed for {communityName}
      </Headline>
      <Paragraph>If this isn&apos;t right, you can dispute the claim below.</Paragraph>
      <ActionRow href={disputeUrl} label="Dispute this claim" />
      <FinePrint>If you have questions, reply to this email or contact PropertyPro support.</FinePrint>
    </EmailLayout>
  );
}
