/**
 * Notifications query helpers.
 *
 * Uses Drizzle directly (within packages/db — not subject to the scoped-client
 * CI guard that applies to apps/web).
 *
 * AUTHORIZATION CONTRACT: All read/update functions require both communityId
 * and userId parameters. API routes calling these MUST validate communityId
 * via resolveEffectiveCommunityId and userId via requireAuthenticatedUserId +
 * requireCommunityMembership BEFORE calling any function here. The app server
 * connects as service_role (bypasses RLS), so these WHERE-clause filters are
 * the primary tenant isolation mechanism — same pattern as notification-digest.ts.
 */
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { db } from '../drizzle';
import { notifications } from '../schema/notifications';
import type { NotificationCategory } from '../schema/notifications';

export type { NotificationCategory };

export interface ListNotificationsParams {
  communityId: number;
  userId: string;
  cursor?: number;
  limit: number;
  category?: NotificationCategory;
  unreadOnly?: boolean;
}

export async function listNotifications(params: ListNotificationsParams) {
  const { communityId, userId, cursor, limit, category, unreadOnly } = params;

  const conditions = [
    eq(notifications.communityId, communityId),
    eq(notifications.userId, userId),
    isNull(notifications.archivedAt),
    isNull(notifications.deletedAt),
  ];

  if (cursor != null) conditions.push(lt(notifications.id, cursor));
  if (category != null) conditions.push(eq(notifications.category, category));
  if (unreadOnly) conditions.push(isNull(notifications.readAt));

  return db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
}

export async function countUnreadNotifications(
  communityId: number,
  userId: string,
): Promise<number> {
  const result = await db
    .select({ count: sql<number>`cast(count(*) as integer)` })
    .from(notifications)
    .where(
      and(
        eq(notifications.communityId, communityId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
        isNull(notifications.deletedAt),
      ),
    );
  return result[0]?.count ?? 0;
}

export async function markNotificationsRead(
  communityId: number,
  userId: string,
  ids?: number[],
): Promise<void> {
  const conditions = [
    eq(notifications.communityId, communityId),
    eq(notifications.userId, userId),
    isNull(notifications.readAt),
  ];
  if (ids != null && ids.length > 0) conditions.push(inArray(notifications.id, ids));

  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(...conditions));
}

export async function archiveNotifications(
  communityId: number,
  userId: string,
  ids: number[],
): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(notifications)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(notifications.communityId, communityId),
        eq(notifications.userId, userId),
        inArray(notifications.id, ids),
      ),
    );
}

export interface InsertNotificationRow {
  communityId: number;
  userId: string;
  category: NotificationCategory;
  title: string;
  body?: string;
  actionUrl?: string;
  sourceType: string;
  sourceId: string;
  priority?: string;
}

const INSERT_CHUNK_SIZE = 100;

export async function insertNotifications(
  rows: InsertNotificationRow[],
): Promise<{ created: number }> {
  if (rows.length === 0) return { created: 0 };

  let created = 0;
  for (let i = 0; i < rows.length; i += INSERT_CHUNK_SIZE) {
    const chunk = rows.slice(i, i + INSERT_CHUNK_SIZE);
    const result = await db
      .insert(notifications)
      .values(chunk.map((r) => ({ ...r, priority: r.priority ?? 'normal' })))
      .onConflictDoNothing()
      .returning({ id: notifications.id });
    created += result.length;
  }
  return { created };
}
