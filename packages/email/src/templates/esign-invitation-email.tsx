import { EmailLayout, type EmailMastheadChip } from '../components/email-layout';
import { ActionRow, CategoryMark, FinePrint, Headline, Quote, StatusPill, Strong } from '../components/email-blocks';
import { emailTheme as c, type EmailTone } from '../components/theme';
import type { BaseEmailProps } from '../types';

/** One signer in the signing order, as the design's signer table shows it. */
export interface EsignSigner {
  name: string;
  /** Board office or relationship, e.g. "Treasurer". */
  role?: string;
  status: 'signed' | 'awaiting_you' | 'pending';
  /** Already-formatted date, shown on a `signed` row. */
  signedAt?: string;
}

export interface EsignInvitationEmailProps extends BaseEmailProps {
  signerName: string;
  senderName: string;
  documentName: string;
  signingUrl: string;
  expiresAt?: string;
  messageBody?: string;
  /** Optional signing order. Rendered (with a "N of M signed" chip) only when supplied. */
  signers?: EsignSigner[];
  /** Optional page count, shown under the document name. */
  pageCount?: number;
}

const SIGNER_STATUS: Record<EsignSigner['status'], { tone: EmailTone; label: string }> = {
  signed: { tone: 'green', label: 'Signed' },
  awaiting_you: { tone: 'violet', label: 'Awaiting you' },
  pending: { tone: 'neutral', label: 'Pending' },
};

/** "2 of 4 signed" — the masthead chip, or undefined when no signing order was supplied. */
export function esignProgressChip(signers: EsignSigner[] | undefined): EmailMastheadChip | undefined {
  if (!signers || signers.length === 0) return undefined;
  const signed = signers.filter((signer) => signer.status === 'signed').length;
  return { label: `${signed} of ${signers.length} signed`, tone: 'violet' };
}

/**
 * The document panel: name, page count, then the signer order with a status
 * pill per row. Built here (not in email-blocks) because only the e-sign family
 * uses it. Renders nothing unless there is a page count or a signing order —
 * the headline already names the document.
 */
export function EsignDocumentPanel({
  documentName,
  pageCount,
  signers,
}: {
  documentName: string;
  pageCount?: number;
  signers?: EsignSigner[];
}) {
  const hasSigners = !!signers && signers.length > 0;
  const hasPages = typeof pageCount === 'number' && pageCount > 0;
  if (!hasSigners && !hasPages) return null;

  return (
    <table
      role="presentation"
      width="100%"
      cellPadding={0}
      cellSpacing={0}
      style={{
        backgroundColor: c.masthead,
        border: `1px solid ${c.border}`,
        borderRadius: '10px',
        borderCollapse: 'separate',
        margin: '0 0 28px 0',
      }}
    >
      <tbody>
        <tr>
          <td style={{ padding: hasSigners ? '19px 20px 14px' : '19px 20px 17px' }}>
            <div style={{ fontSize: '17px', fontWeight: 600, color: c.ink, wordBreak: 'break-word' }}>{documentName}</div>
            {hasPages && (
              <div style={{ fontSize: '12px', color: c.body, marginTop: '3px' }}>
                {pageCount === 1 ? '1 page' : `${pageCount} pages`}
              </div>
            )}
          </td>
        </tr>
        {hasSigners && (
          <tr>
            <td style={{ padding: '0 20px 16px' }}>
              <table role="presentation" width="100%" cellPadding={0} cellSpacing={0} style={{ borderTop: `1px solid ${c.border}` }}>
                <tbody>
                  {signers!.map((signer, index) => {
                    const status = SIGNER_STATUS[signer.status];
                    const you = signer.status === 'awaiting_you';
                    const label =
                      signer.status === 'signed' && signer.signedAt ? `${status.label} ${signer.signedAt}` : status.label;
                    return (
                      <tr key={index}>
                        <td
                          style={{
                            padding: index === 0 ? '12px 0 0' : '9px 0 0',
                            fontSize: '13px',
                            color: signer.status === 'pending' ? c.meta : c.ink,
                            fontWeight: you ? 600 : 400,
                            verticalAlign: 'middle',
                          }}
                        >
                          {signer.name}
                          {signer.role && <span style={{ color: c.meta, fontWeight: 400 }}> · {signer.role}</span>}
                        </td>
                        <td
                          style={{
                            padding: index === 0 ? '12px 0 0 12px' : '9px 0 0 12px',
                            textAlign: 'right',
                            verticalAlign: 'middle',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          <StatusPill tone={status.tone} dot={signer.status !== 'signed'}>
                            {signer.status === 'signed' ? `✓ ${label}` : label}
                          </StatusPill>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </td>
          </tr>
        )}
      </tbody>
    </table>
  );
}

/**
 * Layout A5 · E-sign invitation — collect one signature in under a minute, on
 * a phone. When the signing order is supplied it shows where the reader sits
 * in the queue, so the ask reads as finite rather than administrative.
 *
 * Called as a plain function by esign-service (`EsignInvitationEmail({...})`),
 * so this and the panel above must stay hook-free.
 */
export function EsignInvitationEmail({
  branding,
  previewText,
  signerName,
  senderName,
  documentName,
  signingUrl,
  expiresAt,
  messageBody,
  signers,
  pageCount,
}: EsignInvitationEmailProps) {
  return (
    <EmailLayout
      branding={branding}
      tone="violet"
      previewText={previewText ?? `${senderName} has requested your signature on "${documentName}"`}
      mastheadContext="Signature request"
      mastheadChip={esignProgressChip(signers)}
    >
      <CategoryMark icon="pen-violet" label="Your signature is requested" tone="violet" />
      <Headline
        lede={
          <>
            Hi {signerName} — {senderName} from <Strong>{branding.communityName}</Strong> has asked you to sign this
            document.
          </>
        }
      >
        {documentName}
      </Headline>
      {messageBody && <Quote attribution={`— ${senderName}`}>{messageBody}</Quote>}
      <EsignDocumentPanel documentName={documentName} pageCount={pageCount} signers={signers} />
      <ActionRow href={signingUrl} label="Review & sign" variant="violet" />
      <FinePrint>
        {expiresAt && <>This signing request expires on {expiresAt}. </>}
        If you did not expect this request, you can safely ignore this email.
      </FinePrint>
    </EmailLayout>
  );
}

export default EsignInvitationEmail;
