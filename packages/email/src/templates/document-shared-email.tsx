import { Link } from '@react-email/components';
import { EmailLayout } from '../components/email-layout';
import { ActionRow, FinePrint, Headline, InlineMark, ItemRows } from '../components/email-blocks';
import { emailTheme } from '../components/theme';
import type { BaseEmailProps } from '../types';

export interface DocumentSharedEmailProps extends BaseEmailProps {
  recipientName: string;
  senderName: string;
  /** `url` opens that document (`/documents/<id>`), behind the portal sign-in. */
  documents: Array<{ title: string; url: string }>;
  /** The community's document library — the action when several were sent. */
  portalUrl: string;
}

/**
 * Layout A11 · Document shared — a manager sent specific documents to this
 * resident from the Directory. Same compact weight as "document posted"; the
 * difference is who chose to send it. It is a courtesy copy, not a statutory
 * notice, so it makes no notice claim.
 *
 * One document: the action opens it. Several: each title opens its document
 * and the action opens the library.
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
      {documents.length > 1 ? (
        <ItemRows
          items={documents.map((d) => ({
            title: (
              <Link href={d.url} style={{ color: emailTheme.ink, textDecoration: 'none' }}>
                {d.title}
              </Link>
            ),
          }))}
        />
      ) : null}
      <ActionRow
        href={documents.length === 1 ? documents[0]!.url : portalUrl}
        label={documents.length === 1 ? 'View document' : 'View documents'}
      />
      <FinePrint>Sign in to your portal to open {documents.length === 1 ? 'it' : 'them'}. Association documents are always in its Documents section.</FinePrint>
    </EmailLayout>
  );
}
