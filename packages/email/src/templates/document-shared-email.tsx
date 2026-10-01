import { EmailLayout } from '../components/email-layout';
import { ActionRow, FinePrint, Headline, InlineMark, ItemRows } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface DocumentSharedEmailProps extends BaseEmailProps {
  recipientName: string;
  senderName: string;
  documents: Array<{ title: string }>;
  portalUrl: string;
}

/**
 * Layout A11 · Document shared — a manager sent specific documents to this
 * resident from the Directory. Same compact weight as "document posted"; the
 * difference is who chose to send it. It is a courtesy copy, not a statutory
 * notice, so it makes no notice claim.
 *
 * ponytail: one link to the library, not one per document — the app has no
 * per-document page yet (`/documents/:id` 404s). Link each title once it does.
 */
export function DocumentSharedEmail({
  branding,
  previewText,
  recipientName,
  senderName,
  documents,
  portalUrl,
}: DocumentSharedEmailProps) {
  const noun = documents.length === 1 ? 'a document' : `${documents.length} documents`;
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `${senderName} sent you ${noun}`}
      mastheadSize="compact"
      mastheadMeta="Records"
    >
      <InlineMark icon="doc-coral" label="Documents for you" tone="coral" />
      <Headline compact lede={<>Hi {recipientName} — {senderName} at {branding.communityName} sent you {noun}.</>}>
        {documents.length === 1 ? documents[0]!.title : `${documents.length} documents`}
      </Headline>
      {documents.length > 1 ? <ItemRows items={documents.map((d) => ({ title: d.title }))} /> : null}
      <ActionRow href={portalUrl} label={documents.length === 1 ? 'View document' : 'View documents'} />
      <FinePrint>Sign in to your portal to open {documents.length === 1 ? 'it' : 'them'}. Association documents are always in its Documents section.</FinePrint>
    </EmailLayout>
  );
}
