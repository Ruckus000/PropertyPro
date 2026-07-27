/**
 * Website editor v3, Phase 7 — urgent notice service.
 *
 * The highest-blast-radius write in the product. It bypasses the draft layer
 * completely: there is no review, no publish step, no preview. Whatever this
 * function writes is on every page of the community's public site by the next
 * request.
 *
 * Every guard below exists because of that, not out of general caution.
 */
import { eq } from '@propertypro/db/filters';
import { communities, logAuditEvent } from '@propertypro/db';
// AUTHZ: Phase 7 urgent notice — reads and writes the communities row by primary
// key. communities is the ROOT tenant table: it has no community_id column to
// scope by (it IS the community_id), so createScopedClient cannot address it.
// Callers are gated by ensurePmAccess in the route (PM role + membership in the
// target community + hasSiteEditor) before reaching here.
import { createUnscopedClient } from '@propertypro/db/unsafe';
import { ConflictError, ValidationError } from '@/lib/api/errors';
import { normalizeUrgentNoticeText } from '@/lib/site-editor/urgent-notice';

/** What the editor and the route need to describe the current notice. */
export interface UrgentNoticeRecord {
  text: string;
  expiresAt: Date | null;
  setAt: Date | null;
}

export interface SetUrgentNoticeParams {
  communityId: number;
  actorUserId: string;
  text: string;
  /** Null keeps the notice up until a manager removes it. */
  expiresAt: Date | null;
}

export interface ClearUrgentNoticeParams {
  communityId: number;
  actorUserId: string;
}

/**
 * Read the stored notice, whatever its expiry.
 *
 * Deliberately returns an EXPIRED notice too. The editor has to be able to show
 * a manager "you posted this, it came down at 4pm" — filtering here would make
 * a notice that is invisible to the public also invisible to the person
 * responsible for it. Public renderers apply `isUrgentNoticeActive` themselves.
 */
export async function getUrgentNotice(
  communityId: number,
): Promise<UrgentNoticeRecord | null> {
  const db = createUnscopedClient();
  const rows = await db
    .select({
      text: communities.urgentNoticeText,
      expiresAt: communities.urgentNoticeExpiresAt,
      setAt: communities.urgentNoticeSetAt,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const row = rows[0];
  if (!row?.text) return null;
  return { text: row.text, expiresAt: row.expiresAt, setAt: row.setAt };
}

/**
 * Post or replace the urgent notice.
 *
 * Throws `ConflictError` when the site has never been published — there is
 * nowhere to show a notice, and silently accepting the write would leave a
 * manager believing residents had been warned when no page exists to warn them
 * on. Throws `ValidationError` on empty, over-length, or already-past input.
 */
export async function setUrgentNotice({
  communityId,
  actorUserId,
  text,
  expiresAt,
}: SetUrgentNoticeParams): Promise<UrgentNoticeRecord> {
  const db = createUnscopedClient();

  const rows = await db
    .select({
      sitePublishedAt: communities.sitePublishedAt,
      previousText: communities.urgentNoticeText,
      previousExpiresAt: communities.urgentNoticeExpiresAt,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const current = rows[0];
  if (!current) {
    throw new ConflictError('Community not found.');
  }
  if (current.sitePublishedAt === null) {
    throw new ConflictError(
      'Publish your website before posting an urgent notice — there is nowhere to show it yet.',
    );
  }

  // Second of the three enforcement layers (Zod at the boundary, this, and the
  // DB CHECK from migration 0042). Re-running it here means the cap holds even
  // if a future caller reaches the service without going through the route.
  let normalized: string;
  try {
    normalized = normalizeUrgentNoticeText(text);
  } catch (error) {
    throw new ValidationError(
      error instanceof Error ? error.message : 'Invalid urgent notice text.',
    );
  }

  const setAt = new Date();

  if (expiresAt !== null) {
    if (Number.isNaN(expiresAt.getTime())) {
      throw new ValidationError('The expiry time is not a valid date.');
    }
    // A notice that expires in the past would be written and then never
    // rendered — the manager would see "posted" and residents would see
    // nothing. Refuse rather than accept a write that cannot do its job.
    if (expiresAt.getTime() <= setAt.getTime()) {
      throw new ValidationError('The expiry time must be in the future.');
    }
  }

  await db
    .update(communities)
    .set({
      urgentNoticeText: normalized,
      urgentNoticeExpiresAt: expiresAt,
      urgentNoticeSetAt: setAt,
      urgentNoticeSetBy: actorUserId,
    })
    .where(eq(communities.id, communityId));

  await logAuditEvent({
    userId: actorUserId,
    communityId,
    action: 'urgent_notice_set',
    resourceType: 'community',
    resourceId: String(communityId),
    oldValues: {
      urgentNoticeText: current.previousText,
      urgentNoticeExpiresAt: current.previousExpiresAt?.toISOString() ?? null,
    },
    // The notice text itself is logged on purpose: it is public the moment it
    // is written, so this records nothing that was not already disclosed, and
    // it is the only record of what residents were actually told.
    newValues: {
      urgentNoticeText: normalized,
      urgentNoticeExpiresAt: expiresAt?.toISOString() ?? null,
    },
  });

  return { text: normalized, expiresAt, setAt };
}

/**
 * Take the notice down.
 *
 * Idempotent: clearing when nothing is posted succeeds and logs nothing. The
 * editor's Undo re-posts through `setUrgentNotice`, so a mistaken removal that
 * is undone leaves both events in the audit trail, in order.
 */
export async function clearUrgentNotice({
  communityId,
  actorUserId,
}: ClearUrgentNoticeParams): Promise<void> {
  const db = createUnscopedClient();

  const rows = await db
    .select({
      previousText: communities.urgentNoticeText,
      previousExpiresAt: communities.urgentNoticeExpiresAt,
    })
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);

  const current = rows[0];
  if (!current?.previousText) return;

  await db
    .update(communities)
    .set({
      urgentNoticeText: null,
      urgentNoticeExpiresAt: null,
      urgentNoticeSetAt: null,
      urgentNoticeSetBy: null,
    })
    .where(eq(communities.id, communityId));

  await logAuditEvent({
    userId: actorUserId,
    communityId,
    action: 'urgent_notice_cleared',
    resourceType: 'community',
    resourceId: String(communityId),
    oldValues: {
      urgentNoticeText: current.previousText,
      urgentNoticeExpiresAt: current.previousExpiresAt?.toISOString() ?? null,
    },
  });
}
