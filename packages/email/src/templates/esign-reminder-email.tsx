import { EmailLayout } from '../components/email-layout';
import { ActionRow, CategoryMark, FinePrint, Headline, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';
import { EsignDocumentPanel, type EsignSigner } from './esign-invitation-email';

export interface EsignReminderEmailProps extends BaseEmailProps {
  signerName: string;
  documentName: string;
  signingUrl: string;
  reminderNumber: number;
  expiresAt?: string;
  /** Optional signing order, as on the invitation. Rendered only when supplied. */
  signers?: EsignSigner[];
  /** Optional page count, shown under the document name. */
  pageCount?: number;
}

function formatOrdinal(n: number): string {
  const suffixes: Record<string, string> = {
    one: 'st',
    two: 'nd',
    few: 'rd',
    other: 'th',
  };
  const pr = new Intl.PluralRules('en-US', { type: 'ordinal' });
  const rule = pr.select(n);
  return `${n}${suffixes[rule] ?? 'th'}`;
}

/**
 * Layout A5 · E-sign reminder — the invitation's structure again, with the
 * masthead chip naming which reminder this is. The expiry sits beside the
 * button, where the decision is made.
 *
 * Called as a plain function by esign-service (`EsignReminderEmail({...})`),
 * so it must stay hook-free.
 */
export function EsignReminderEmail({
  branding,
  previewText,
  signerName,
  documentName,
  signingUrl,
  reminderNumber,
  expiresAt,
  signers,
  pageCount,
}: EsignReminderEmailProps) {
  const ordinal = formatOrdinal(reminderNumber);

  return (
    <EmailLayout
      branding={branding}
      tone="violet"
      previewText={previewText ?? `Reminder: Your signature is needed on "${documentName}"`}
      mastheadContext="Signature request"
      mastheadChip={{ label: `${ordinal} reminder`, tone: 'violet' }}
    >
      <CategoryMark icon="pen-violet" label="Signature reminder" tone="violet" />
      <Headline
        lede={
          <>
            Hi {signerName} — a document from <Strong>{branding.communityName}</Strong> is still awaiting your
            signature.
          </>
        }
      >
        {documentName}
      </Headline>
      <EsignDocumentPanel documentName={documentName} pageCount={pageCount} signers={signers} />
      <ActionRow
        href={signingUrl}
        label="Sign now"
        variant="violet"
        aside={expiresAt ? <>Expires {expiresAt}</> : undefined}
      />
      <FinePrint>
        {expiresAt
          ? <>This signing request expires on {expiresAt}. Please sign before the deadline to avoid delays. </>
          : <>Please review and sign the document at your earliest convenience. </>}
        If you have already signed this document, please disregard this reminder.
      </FinePrint>
    </EmailLayout>
  );
}

export default EsignReminderEmail;
