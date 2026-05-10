/**
 * Announcement Service
 *
 * Tenant-scoped data helpers for /api/v1/announcements mutation flows.
 * Routes own validation, authz, audit semantics, sanitization, and delivery
 * side effects; this file owns table access.
 */
import { announcements, createScopedClient, users, type Announcement } from '@propertypro/db';
import { eq } from '@propertypro/db/filters';

/**
 * Create an announcement row for a community.
 *
 * AUTHZ: caller MUST have verified community membership,
 * `requirePermission('announcements', 'write')`, and the active-subscription
 * mutation gate.
 */
export async function createAnnouncementForCommunity(
  communityId: number,
  values: {
    [key: string]: unknown;
    title: string;
    body: string;
    audience: 'all' | 'owners_only' | 'board_only' | 'tenants_only';
    isPinned: boolean;
    publishedBy: string;
  },
): Promise<Announcement> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.insert(announcements, values);
  return rows[0] as Announcement;
}

/**
 * Fetch one active announcement by id.
 *
 * AUTHZ: caller MUST have verified the actor has read/write access for the
 * route operation being performed.
 */
export async function getAnnouncementById(
  communityId: number,
  announcementId: number,
): Promise<Announcement | null> {
  const scoped = createScopedClient(communityId);
  return (await scoped.queryById(announcements, announcementId)) as Announcement | null;
}

/**
 * Fetch one announcement by id, including soft-deleted rows.
 *
 * AUTHZ: caller MUST have verified admin/write access for restore.
 */
export async function getAnnouncementByIdIncludingDeleted(
  communityId: number,
  announcementId: number,
): Promise<Announcement | null> {
  const scoped = createScopedClient(communityId);
  return (await scoped.queryById(announcements, announcementId, {
    includeSoftDeleted: true,
  })) as Announcement | null;
}

/**
 * Update an active announcement row.
 *
 * AUTHZ: caller MUST have verified `requirePermission('announcements', 'write')`.
 */
export async function updateAnnouncementForCommunity(
  communityId: number,
  announcementId: number,
  values: Record<string, unknown>,
): Promise<Announcement | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.update(announcements, values, eq(announcements.id, announcementId));
  return (rows[0] as Announcement | undefined) ?? null;
}

/**
 * Soft-delete an announcement row.
 *
 * AUTHZ: caller MUST have verified the actor is either the author or an
 * authorized announcement moderator.
 */
export async function softDeleteAnnouncementForCommunity(
  communityId: number,
  announcementId: number,
): Promise<void> {
  const scoped = createScopedClient(communityId);
  await scoped.softDelete(announcements, eq(announcements.id, announcementId));
}

/**
 * Restore a soft-deleted announcement row.
 *
 * AUTHZ: caller MUST have verified `requirePermission('announcements', 'write')`.
 */
export async function restoreAnnouncementForCommunity(
  communityId: number,
  announcementId: number,
): Promise<Announcement | null> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.restoreSoftDelete(announcements, eq(announcements.id, announcementId));
  return (rows[0] as Announcement | undefined) ?? null;
}

/**
 * Resolve an author's display name for announcement delivery.
 *
 * This intentionally uses a point lookup instead of the inherited
 * `scoped.query(users)` + JS `.find()` pattern because `users` is a
 * platform-global table.
 *
 * AUTHZ: caller MUST have verified the announcement write operation for this
 * community.
 */
export async function getAnnouncementAuthorName(
  communityId: number,
  userId: string,
): Promise<string> {
  const scoped = createScopedClient(communityId);
  const rows = await scoped.selectFrom<{ fullName: string | null }>(
    users,
    { fullName: users.fullName },
    eq(users.id, userId),
  );
  return typeof rows[0]?.fullName === 'string' && rows[0].fullName.trim().length > 0
    ? rows[0].fullName
    : 'Community Team';
}
