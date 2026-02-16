import {
  and,
  asc,
  eq,
  inArray,
  isNotNull,
  lt,
  lte,
  or,
} from 'drizzle-orm';
import { db } from '../drizzle';
import { notificationDigestQueue } from '../schema';

export type DigestFrequency = 'daily_digest' | 'weekly_digest';

export async function findCandidateDigestCommunityIds(params: {
  now: Date;
  staleBefore: Date;
  limit: number;
}): Promise<number[]> {
  const rows = await db
    .select({
      communityId: notificationDigestQueue.communityId,
    })
    .from(notificationDigestQueue)
    .where(
      or(
        and(
          eq(notificationDigestQueue.status, 'pending'),
          lte(notificationDigestQueue.nextAttemptAt, params.now),
        ),
        and(
          eq(notificationDigestQueue.status, 'processing'),
          isNotNull(notificationDigestQueue.processingStartedAt),
          lt(notificationDigestQueue.processingStartedAt, params.staleBefore),
        ),
      ),
    )
    .groupBy(notificationDigestQueue.communityId)
    .orderBy(asc(notificationDigestQueue.communityId))
    .limit(params.limit);

  return rows.map((row) => row.communityId);
}

export async function claimDigestQueueRows(params: {
  communityId: number;
  frequencies: DigestFrequency[];
  now: Date;
  staleBefore: Date;
  limit: number;
}) {
  if (params.frequencies.length === 0 || params.limit <= 0) return [];

  const dueRows = await db
    .select({ id: notificationDigestQueue.id })
    .from(notificationDigestQueue)
    .where(
      and(
        eq(notificationDigestQueue.communityId, params.communityId),
        inArray(notificationDigestQueue.frequency, params.frequencies),
        or(
          and(
            eq(notificationDigestQueue.status, 'pending'),
            lte(notificationDigestQueue.nextAttemptAt, params.now),
          ),
          and(
            eq(notificationDigestQueue.status, 'processing'),
            isNotNull(notificationDigestQueue.processingStartedAt),
            lt(notificationDigestQueue.processingStartedAt, params.staleBefore),
          ),
        ),
      ),
    )
    .orderBy(asc(notificationDigestQueue.createdAt))
    .limit(params.limit);

  if (dueRows.length === 0) return [];

  const ids = dueRows.map((row) => row.id);
  return db
    .update(notificationDigestQueue)
    .set({
      status: 'processing',
      processingStartedAt: params.now,
      updatedAt: params.now,
    })
    .where(
      and(
        inArray(notificationDigestQueue.id, ids),
        eq(notificationDigestQueue.communityId, params.communityId),
        inArray(notificationDigestQueue.frequency, params.frequencies),
        or(
          eq(notificationDigestQueue.status, 'pending'),
          and(
            eq(notificationDigestQueue.status, 'processing'),
            isNotNull(notificationDigestQueue.processingStartedAt),
            lt(notificationDigestQueue.processingStartedAt, params.staleBefore),
          ),
        ),
      ),
    )
    .returning();
}

export async function hasMoreDigestRows(params: {
  now: Date;
  staleBefore: Date;
}): Promise<boolean> {
  const rows = await db
    .select({ id: notificationDigestQueue.id })
    .from(notificationDigestQueue)
    .where(
      or(
        and(
          eq(notificationDigestQueue.status, 'pending'),
          lte(notificationDigestQueue.nextAttemptAt, params.now),
        ),
        and(
          eq(notificationDigestQueue.status, 'processing'),
          isNotNull(notificationDigestQueue.processingStartedAt),
          lt(notificationDigestQueue.processingStartedAt, params.staleBefore),
        ),
      ),
    )
    .limit(1);

  return rows.length > 0;
}
