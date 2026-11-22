/**
 * The "received or created on" date of a document (audit 2026-11-05, H-2).
 *
 * Its own module so the compliance and meetings routes can write it without
 * loading the documents service, whose module scope reads the db package.
 */
import { createScopedClient, documents } from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';

/**
 * Record when the association received or created a document (H-2), ONCE.
 *
 * The date decides whether a posting was on time, so it is first-write-wins,
 * like the meeting stamps (`stampMeetingColumn`): re-linking a file or
 * re-recording minutes cannot move it to turn a late posting into an on-time
 * one. A date already recorded is kept and reported. A genuine correction is a
 * data repair, audited as one (.claude/rules/migration-safety.md).
 *
 * Returns `null` when no live document with that id exists in the community;
 * otherwise whether this call wrote, and the date now on the document.
 *
 * AUTHZ: tenant-scoped — caller MUST have verified a write permission on the
 * record (`compliance:write` on the link flow, `meetings:write` on recording
 * minutes) and that the document belongs to the community.
 */
export async function setDocumentReceivedAt(
  communityId: number,
  documentId: number,
  receivedAt: Date,
): Promise<{ written: boolean; receivedAt: Date } | null> {
  const scoped = createScopedClient(communityId);
  const updated = (await scoped.update(
    documents,
    { receivedAt },
    and(eq(documents.id, documentId), isNull(documents.receivedAt)),
  )) as unknown as Array<unknown>;
  if (updated.length > 0) return { written: true, receivedAt };
  const rows = (await scoped.selectFrom(
    documents,
    { id: documents.id, receivedAt: documents.receivedAt },
    eq(documents.id, documentId),
  )) as unknown as Array<{ id: number; receivedAt: Date | string | null }>;
  const current = rows[0];
  if (!current || current.receivedAt == null) return null;
  return { written: false, receivedAt: new Date(current.receivedAt) };
}
