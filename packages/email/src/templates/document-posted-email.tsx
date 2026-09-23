import { EmailLayout } from '../components/email-layout';
import { ActionRow, DataRows, FinePrint, Headline, InlineMark } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface DocumentPostedEmailProps extends BaseEmailProps {
  recipientName: string;
  documentTitle: string;
  documentCategory?: string;
  uploadedByName: string;
  portalUrl: string;
}

/**
 * Layout A11 · Document posted — the compact end of the scale: small
 * masthead, 24px headline, a couple of meta rows, one action. Routine mail
 * must not borrow the weight of a notice.
 */
export function DocumentPostedEmail({
  branding,
  previewText,
  recipientName,
  documentTitle,
  documentCategory,
  uploadedByName,
  portalUrl,
}: DocumentPostedEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `${branding.communityName}: New document posted`}
      mastheadSize="compact"
      mastheadMeta="Records"
    >
      <InlineMark icon="doc-coral" label="New document posted" tone="coral" />
      <Headline compact lede={<>Hi {recipientName} — this document is now in the association record at {branding.communityName}.</>}>
        {documentTitle}
      </Headline>
      <DataRows
        rows={[
          { label: 'Category', value: documentCategory },
          { label: 'Uploaded by', value: uploadedByName },
        ]}
      />
      <ActionRow href={portalUrl} label="View document" />
      <FinePrint>
        Per Florida Statute §718.111(12)(g), association documents must be available to unit owners through the
        association&apos;s website.
      </FinePrint>
    </EmailLayout>
  );
}
