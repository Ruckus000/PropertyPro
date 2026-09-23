import { EmailLayout } from '../components/email-layout';
import { CategoryMark, DataRows, FinePrint, Headline, Paragraph, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface EsignCompletedEmailProps extends BaseEmailProps {
  senderName: string;
  documentName: string;
  completedAt: string;
  signerCount: number;
}

/**
 * Layout A5 · E-sign completed — the invitation's frame in its finished
 * state: a green "Completed" result chip in place of the signing action.
 * There is no link to the executed document in the props, so there is no
 * button — the copy points at the documents portal instead.
 */
export function EsignCompletedEmail({
  branding,
  previewText,
  senderName,
  documentName,
  completedAt,
  signerCount,
}: EsignCompletedEmailProps) {
  const signerLabel = signerCount === 1 ? '1 signer' : `${signerCount} signers`;

  return (
    <EmailLayout
      branding={branding}
      tone="green"
      previewText={previewText ?? `All signatures collected for "${documentName}"`}
      mastheadContext="Signature request"
      mastheadChip={{ label: 'Completed', tone: 'green' }}
    >
      <CategoryMark icon="pen-violet" label="Signing complete" tone="violet" />
      <Headline
        lede={
          <>
            Hi {senderName} — all signatures have been collected for <Strong>{documentName}</Strong>.
          </>
        }
      >
        All signatures collected
      </Headline>
      <DataRows
        variant="panel"
        rows={[
          { label: 'Document', value: documentName },
          { label: 'Signers', value: signerLabel },
          { label: 'Completed', value: completedAt, tone: 'green' },
        ]}
      />
      <Paragraph>The fully executed document is now available in your documents portal.</Paragraph>
      <FinePrint>This document is stored in your document repository at {branding.communityName}.</FinePrint>
    </EmailLayout>
  );
}

export default EsignCompletedEmail;
