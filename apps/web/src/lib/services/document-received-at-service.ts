/**
 * The "received or created on" date of a document (audit 2026-11-05, H-2).
 *
 * Its own module so the compliance and meetings routes can write it without
 * loading the documents service, whose module scope reads the db package.
 */
import { createScopedClient, documents } from '@propertypro/db';
import { and, eq, gt, isNull, or } from '@propertypro/db/filters';

/** Why a date was not used, said to the manager as a response warning. */
export const RECEIVED_DATE_KEPT_WARNING = {
  code: 'received_date_kept',
  message:
    'This file already has an earlier date recorded, so that date was kept. Its 30-day posting window runs from it.',
} as const;

/**
 * Record when the association received or created a document (H-2).
 *
 * The date decides whether a posting was on time, so it may only move
 * EARLIER: a first date is written, and a later call may correct it to an
 * earlier one (minutes uploaded today, then recorded as approved six weeks
 * ago). It can never move later, which is the only direction that would turn
 * a late posting into an on-time one. The guard is in the UPDATE's WHERE, so
 * concurrent writers cannot both land.
 *
 * Returns `null` when no live document with that id exists in the community;
 * otherwise whether this call wrote, the date it replaced, and the date now on
 * the document. When it did not write, the caller tells the manager
 * (`RECEIVED_DATE_KEPT_WARNING`) rather than dropping their date silently.
 *
 * AUTHZ: tenant-scoped — caller MUST have verified a write permission on the
 * record (`compliance:write` on the link flow, `meetings:write` on recording
 * minutes) and that the document belongs to the community.
 */
export async function setDocumentReceivedAt(
  communityId: number,
  documentId: number,
  receivedAt: Date,
): Promise<{ written: boolean; previous: Date | null; receivedAt: Date } | null> {
  const scoped = createScopedClient(communityId);
  const read = async (): Promise<Date | null | undefined> => {
    const rows = (await scoped.selectFrom(
      documents,
      { id: documents.id, receivedAt: documents.receivedAt },
      eq(documents.id, documentId),
    )) as unknown as Array<{ id: number; receivedAt: Date | string | null }>;
    if (!rows[0]) return undefined;
    return rows[0].receivedAt ? new Date(rows[0].receivedAt) : null;
  };

  const previous = await read();
  if (previous === undefined) return null;
  const updated = (await scoped.update(
    documents,
    { receivedAt },
    and(
      eq(documents.id, documentId),
      or(isNull(documents.receivedAt), gt(documents.receivedAt, receivedAt)),
    ),
  )) as unknown as Array<unknown>;
  if (updated.length > 0) return { written: true, previous, receivedAt };
  const current = await read();
  if (current == null) return null;
  return { written: false, previous: current, receivedAt: current };
}
