/**
 * "Your community data export is ready."
 *
 * ⚠️ The warnings block is not decoration. An export that LOOKS complete but
 * silently dropped a table or a document file is worse than one that failed
 * outright, because the association only discovers the gap when it needs the
 * record. Every skip the worker recorded is therefore reported in three places —
 * the archive's `manifest.json`, the job poll response, and here — so a board
 * member who only ever reads the email still learns what is missing.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 *
 * Layout P6 · Export ready — hand over a complete record, and disclose the parts
 * that aren't. Warnings are promoted to a masthead chip and a named panel, and
 * the accent turns amber only when warnings exist.
 */
import { EmailLayout } from '../components/email-layout';
import { EmailAlert } from '../components/email-alert';
import { ActionRow, CategoryMark, DataRows, FinePrint, Headline, MultilineText, Strong } from '../components/email-blocks';
import type { BaseEmailProps } from '../types';

export interface CommunityExportReadyEmailProps extends BaseEmailProps {
  recipientName: string;
  communityName: string;
  /** Where to go to download. Login-walled on purpose — see the note below. */
  downloadUrl: string;
  /** Number of zip volumes. More than one means the archive was split by size. */
  partCount: number;
  /** Total archive size across all volumes, already human-formatted. */
  totalSize: string;
  /** Already formatted in the reader's terms, e.g. "August 24, 2026". */
  expiresOn: string;
  /** Human-readable warning lines from the manifest. Empty when clean. */
  warnings?: string[];
}

export function CommunityExportReadyEmail({
  branding,
  previewText,
  recipientName,
  communityName,
  downloadUrl,
  partCount,
  totalSize,
  expiresOn,
  warnings = [],
}: CommunityExportReadyEmailProps) {
  const volumeLabel = partCount === 1 ? '1 file' : `${partCount} files (the archive was split by size)`;
  const hasWarnings = warnings.length > 0;
  const warningLabel = `${warnings.length} warning${warnings.length !== 1 ? 's' : ''}`;

  return (
    <EmailLayout
      branding={branding}
      sender="platform"
      tone={hasWarnings ? 'amber' : 'coral'}
      previewText={previewText ?? `Your ${communityName} data export is ready to download`}
      mastheadContext={communityName}
      mastheadChip={hasWarnings ? { label: warningLabel, tone: 'amber' } : undefined}
    >
      <CategoryMark
        icon={hasWarnings ? 'download-amber' : 'download-slate'}
        label="Data export · finished"
        tone={hasWarnings ? 'amber' : 'meta'}
      />
      <Headline
        lede={
          <>
            Hi {recipientName} — the full data export you requested for <Strong>{communityName}</Strong> has finished.
          </>
        }
      >
        Your data export is ready
      </Headline>
      <DataRows
        rows={[
          { label: 'Archive', value: volumeLabel },
          { label: 'Total size', value: totalSize },
          { label: 'Files deleted on', value: expiresOn },
        ]}
      />
      {hasWarnings && (
        <EmailAlert variant="warning" title="Some items could not be included">
          {warnings.map((warning, index) => (
            <div key={index} style={{ margin: '0 0 4px 0' }}>
              &bull; <MultilineText text={warning} />
            </div>
          ))}
          <div style={{ marginTop: '10px' }}>
            The rest of the export completed normally. The full list is also in the <Strong>manifest.json</Strong> file
            inside the archive.
          </div>
        </EmailAlert>
      )}
      <ActionRow href={downloadUrl} label="Download your export" variant={hasWarnings ? 'warning' : 'default'} />
      {/*
        Deliberately NOT a direct signed link. An export volume is a copy of the
        entire association including resident PII, so every download is
        re-authorized and audit-logged at request time; a link that worked
        straight from a forwarded inbox would defeat both.
      */}
      <FinePrint>
        You&rsquo;ll be asked to sign in first. Each download is recorded in the community&rsquo;s audit trail. These
        files are deleted on <Strong>{expiresOn}</Strong>. You can request a new export at any time — there is no charge and
        no limit, including after a subscription has lapsed.
      </FinePrint>
    </EmailLayout>
  );
}
