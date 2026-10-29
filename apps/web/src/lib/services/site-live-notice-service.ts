/**
 * The one-time "Email owners that the site is live" offer (D5).
 *
 * Publishing never emails anyone. After the site is live, the website home
 * offers the manager one **Email owners** click; this service is the state
 * behind that offer, kept on two `communities` columns:
 *
 *   - `site_live_notice_sent_at`: set when the send is claimed. Never cleared
 *     except by `releaseSiteLiveNotice`, after a send that delivered nothing.
 *   - `site_live_notice_dismissed_at`: the manager chose not to email owners.
 *
 * ## Why the send is CLAIMED before it is made
 *
 * A double click, or two managers clicking at once, must email owners exactly
 * once. Reading `sent_at` and writing it afterwards leaves a window in which two
 * requests both read NULL and both send. `claimSiteLiveNotice` closes it with a
 * single conditional statement (`... WHERE site_live_notice_sent_at IS NULL`):
 * the database lets exactly one caller change the row, and only that caller
 * sends. If the send then fails outright, the claim is released so the manager
 * can try again; a partial send keeps it, because the announcement exists.
 *
 * AUTHZ: tenant-scoped. Callers MUST have verified a management role in the
 * community (and `announcements:write` before claiming).
 */
import { communities, createScopedClient, userRoles } from '@propertypro/db';
import { and, eq, isNull } from '@propertypro/db/filters';

export interface SiteLiveNoticeState {
  /** ISO 8601, or null when owners have not been emailed. */
  sentAt: string | null;
  /** ISO 8601, or null when the offer has not been dismissed. */
  dismissedAt: string | null;
  /** Resident members with `is_unit_owner`: the people the email would reach. */
  ownerCount: number;
  /** Both dates null and at least one owner to tell. */
  offerable: boolean;
}

function toIso(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.length > 0) return new Date(value).toISOString();
  return null;
}

export async function getSiteLiveNoticeState(communityId: number): Promise<SiteLiveNoticeState> {
  const scoped = createScopedClient(communityId);
  const [communityRows, ownerRows] = await Promise.all([
    scoped.query(communities),
    // The filter is SQL, not JS: a community can have thousands of members.
    scoped.queryWhere(
      userRoles,
      and(eq(userRoles.role, 'resident'), eq(userRoles.isUnitOwner, true)),
    ),
  ]);
  const community = communityRows.find((row) => row['id'] === communityId);

  // Owners are residents with `isUnitOwner` (ADR-006). Counted by user, so a
  // person holding two rows is one owner.
  const owners = new Set<string>();
  for (const row of ownerRows) {
    const userId = row['userId'];
    if (typeof userId === 'string') owners.add(userId);
  }

  const sentAt = toIso(community?.['siteLiveNoticeSentAt']);
  const dismissedAt = toIso(community?.['siteLiveNoticeDismissedAt']);
  const ownerCount = owners.size;
  return {
    sentAt,
    dismissedAt,
    ownerCount,
    offerable: sentAt === null && dismissedAt === null && ownerCount > 0,
  };
}

/**
 * Claim the send: `UPDATE communities SET site_live_notice_sent_at = now()
 * WHERE id = $1 AND site_live_notice_sent_at IS NULL`. True when this call
 * changed the row, so exactly one of any number of concurrent callers wins.
 */
export async function claimSiteLiveNotice(communityId: number): Promise<boolean> {
  const scoped = createScopedClient(communityId);
  const changed = await scoped.update(
    communities,
    { siteLiveNoticeSentAt: new Date() },
    isNull(communities.siteLiveNoticeSentAt),
  );
  return changed.length === 1;
}

/** Give the claim back after a send that reached no one, so the manager can retry. */
export async function releaseSiteLiveNotice(communityId: number): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.update(communities, { siteLiveNoticeSentAt: null });
}

/** The manager chose not to email owners. Stamped once; dismissing again changes nothing. */
export async function dismissSiteLiveNotice(communityId: number): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.update(
    communities,
    { siteLiveNoticeDismissedAt: new Date() },
    isNull(communities.siteLiveNoticeDismissedAt),
  );
}
