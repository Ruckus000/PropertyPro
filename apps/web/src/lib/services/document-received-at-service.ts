/**
 * The "received or created on" date of a document (audit 2026-11-05, H-2).
 *
 * Its own module so the compliance and meetings routes can write it without
 * loading the documents service, whose module scope reads the db package.
 */
import { createScopedClient, documents } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

/**
 * Record when the association received or created a document (H-2). Returns
 * the previous value for the audit entry, or `null` when no live document with
 * that id exists in the community.
 *
 * AUTHZ: tenant-scoped — caller MUST have verified a write permission on the
 * record (`compliance:write` on the link flow, `meetings:write` on recording
 * minutes) and that the document belongs to the community.
 */
export async function setDocumentReceivedAt(
  communityId: number,
  documentId: number,
  receivedAt: Date,
): Promise<{ previous: Date | null } | null> {
  const scoped = createScopedClient(communityId);
  const rows = (await scoped.selectFrom(
    documents,
    { id: documents.id, receivedAt: documents.receivedAt },
    eq(documents.id, documentId),
  )) as unknown as Array<{ id: number; receivedAt: Date | string | null }>;
  const current = rows[0];
  if (!current) return null;
  await scoped.update(documents, { receivedAt }, eq(documents.id, documentId));
  return { previous: current.receivedAt ? new Date(current.receivedAt) : null };
}
