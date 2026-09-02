/**
 * Completion notification for a finished community-data export.
 *
 * An export takes minutes and finishes on a cron tick, so nobody is watching the
 * page when it completes. Without this the feature would technically work and
 * practically not: a board member requests their records, closes the tab, and
 * never learns the archive existed before the 14-day reaper deletes it.
 *
 * ── Two deliberate choices ──
 *
 * 1. **`transactional`, not bulk.** This is the direct result of an action the
 *    recipient took seconds-to-minutes earlier. `buildHeaders` would demand an
 *    `unsubscribeUrl` for a non-transactional send, and an unsubscribe link on a
 *    "the thing you asked for is ready" email is the wrong affordance.
 * 2. **The email links to the app, never to a signed URL.** A volume is a copy
 *    of the entire association including resident PII. Downloads are
 *    re-authorized and audit-logged per request; a link that worked from a
 *    forwarded inbox would defeat both.
 *
 * Warnings are summarised here as the third of their three required surfaces
 * (manifest, poll response, email) — see the template.
 *
 * See docs/audits/2026-08-09-legal-risk-audit.md F-07.
 */
import { createElement } from 'react';
import { communities, users } from '@propertypro/db';
import type { CommunityExportJob, ExportJobManifest } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';
// Reads exactly two rows — the requesting user and their community name — to
// address one email. Runs from the export cron, which has no session and no
// membership to scope by, and the community is fixed by the job row itself.
// AUTHZ: export-ready notification — single-row lookup of the job's own requester + community.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { CommunityExportReadyEmail, sendEmail } from '@propertypro/email';
import { formatBytes } from '@/lib/utils/format-bytes';

/** How many individual warnings to enumerate before collapsing the rest. */
const MAX_LISTED_WARNINGS = 5;

/**
 * Human-readable warning lines.
 *
 * Grouped by code rather than listed verbatim: a large association missing
 * thirty document files would otherwise produce a thirty-line email that reads
 * as noise, and the reader would learn less, not more.
 */
export function summarizeWarnings(manifest: ExportJobManifest): string[] {
  const warnings = manifest.warnings ?? [];
  if (warnings.length === 0) return [];

  const missingFiles = warnings.filter(
    (w) => w.code === 'DOCUMENT_FILE_MISSING' || w.code === 'DOCUMENT_NO_FILE_PATH',
  );
  const failedTables = warnings.filter((w) => w.code === 'TABLE_READ_FAILED');
  const other = warnings.filter(
    (w) => !missingFiles.includes(w) && !failedTables.includes(w),
  );

  const lines: string[] = [];

  if (missingFiles.length > 0) {
    lines.push(
      `${missingFiles.length} document ${
        missingFiles.length === 1 ? 'file was' : 'files were'
      } listed in the records but could not be retrieved from storage. Their database rows are still included in the export.`,
    );
  }

  for (const table of failedTables.slice(0, MAX_LISTED_WARNINGS)) {
    lines.push(`One record set could not be read and is incomplete: ${table.detail}`);
  }
  if (failedTables.length > MAX_LISTED_WARNINGS) {
    lines.push(`…and ${failedTables.length - MAX_LISTED_WARNINGS} more record sets.`);
  }

  for (const warning of other.slice(0, MAX_LISTED_WARNINGS)) {
    lines.push(warning.detail);
  }
  if (other.length > MAX_LISTED_WARNINGS) {
    lines.push(`…and ${other.length - MAX_LISTED_WARNINGS} more.`);
  }

  return lines;
}

/**
 * Email the requester that their export is ready.
 *
 * **Never throws.** The archive is built, recorded and downloadable before this
 * runs; a Resend outage must not flip a finished job to `failed` and send the
 * worker back to rebuild an export that already exists. Failures are returned,
 * and the caller surfaces them in the run summary.
 */
export async function sendExportReadyEmail(
  job: CommunityExportJob,
): Promise<{ sent: boolean; reason?: string }> {
  try {
    if (!job.requestedBy) {
      return { sent: false, reason: 'requester no longer exists' };
    }

    const db = createUnscopedClient();

    const [requester] = await db
      .select({ email: users.email, fullName: users.fullName })
      .from(users)
      .where(eq(users.id, job.requestedBy))
      .limit(1);

    if (!requester?.email) {
      return { sent: false, reason: 'requester has no email address' };
    }

    const [community] = await db
      .select({ name: communities.name })
      .from(communities)
      .where(eq(communities.id, job.communityId))
      .limit(1);

    const communityName = community?.name ?? 'Your Community';
    const warnings = summarizeWarnings(job.manifest);

    await sendEmail({
      to: requester.email,
      subject: `Your ${communityName} data export is ready`,
      category: 'transactional',
      react: createElement(CommunityExportReadyEmail, {
        branding: { communityName },
        recipientName: requester.fullName ?? 'there',
        communityName,
        downloadUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/settings?communityId=${job.communityId}`,
        partCount: job.partCount ?? 1,
        totalSize: formatBytes(job.totalBytes),
        expiresOn: job.expiresAt
          ? job.expiresAt.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric',
              timeZone: 'UTC',
            })
          : 'a later date',
        warnings,
      }),
    });

    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : String(error) };
  }
}
