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
 */
import { Heading, Text } from '@react-email/components';
import { emailColors } from '@propertypro/tokens/email';
import { EmailLayout } from '../components/email-layout';
import { EmailButton } from '../components/email-button';
import { EmailAlert } from '../components/email-alert';
import * as styles from '../components/shared-styles';
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
  const volumeLabel =
    partCount === 1 ? '1 file' : `${partCount} files (the archive was split by size)`;

  return (
    <EmailLayout
      branding={branding}
      previewText={previewText ?? `Your ${communityName} data export is ready to download`}
      accentColor={warnings.length > 0 ? emailColors.accentWarning : undefined}
    >
      <Heading as="h1" style={styles.heading}>
        Your data export is ready
      </Heading>

      <Text style={styles.body}>Hi {recipientName},</Text>

      <Text style={styles.body}>
        The full data export you requested for <strong>{communityName}</strong> has
        finished. It contains {volumeLabel}, {totalSize} in total.
      </Text>

      <EmailButton href={downloadUrl} variant="default">
        Download your export
      </EmailButton>

      {warnings.length > 0 && (
        <EmailAlert variant="warning" title="Some items could not be included">
          {warnings.map((warning) => (
            <Text key={warning} style={styles.small}>
              &bull; {warning}
            </Text>
          ))}
          <Text style={styles.smallSpaced}>
            The rest of the export completed normally. The full list is also in
            the <strong>manifest.json</strong> file inside the archive.
          </Text>
        </EmailAlert>
      )}

      <Text style={styles.smallSpaced}>
        These files are deleted on <strong>{expiresOn}</strong>. You can request a
        new export at any time — there is no charge and no limit, including after
        a subscription has lapsed.
      </Text>

      {/*
        Deliberately NOT a direct signed link. An export volume is a copy of the
        entire association including resident PII, so every download is
        re-authorized and audit-logged at request time; a link that worked
        straight from a forwarded inbox would defeat both.
      */}
      <Text style={styles.small}>
        You&rsquo;ll be asked to sign in first. Each download is recorded in the
        community&rsquo;s audit trail.
      </Text>
    </EmailLayout>
  );
}
