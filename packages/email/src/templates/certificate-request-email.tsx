import { EmailLayout } from '../components/email-layout';
import { Headline, InlineMark, MultilineText, Paragraph } from '../components/email-blocks';

export interface CertificateRequestEmailProps {
  /** Pre-composed, attorney-reviewed body (newline-separated). */
  body: string;
  /** Optional branding; defaults to a neutral PropertyPro shell. */
  communityName?: string;
}

/**
 * Layout A11 · Document posted (compact) — thin renderer for the
 * certificate-request relay + confirmation emails. The exact wording is
 * composed by `buildCertificateRequestEmail` (attorney-gated in
 * insurance-disclaimers.ts) and passed in as `body`; this template only wraps
 * it in the compact shell. Blank lines split paragraphs; single line breaks
 * are preserved inside a paragraph.
 */
export function CertificateRequestEmail({ body, communityName }: CertificateRequestEmailProps) {
  const paragraphs = body.split(/\n[ \t]*\n/).filter((block) => block.trim().length > 0);

  return (
    <EmailLayout
      branding={{ communityName: communityName ?? 'PropertyPro' }}
      previewText={body.slice(0, 120)}
      mastheadSize="compact"
      mastheadMeta="Insurance"
    >
      <InlineMark icon="doc-coral" label="Insurance certificate" tone="coral" />
      <Headline compact>Certificate of insurance request</Headline>
      {paragraphs.map((block, index) => (
        <Paragraph key={index} size={15} tight={index < paragraphs.length - 1}>
          <MultilineText text={block} />
        </Paragraph>
      ))}
    </EmailLayout>
  );
}
