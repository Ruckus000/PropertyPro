import { sql } from 'drizzle-orm';
import { db } from '../drizzle';

export interface ResidentPortalActivityRow {
  userId: string;
  /** Supabase `auth.users.last_sign_in_at` — the only record that someone has actually signed in. */
  lastSignInAt: Date | null;
  /** Newest invitation issued to this user for this community (consumed or not). */
  lastInvitedAt: Date | null;
}

function toDate(value: unknown): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Portal sign-in / invitation facts for every member of ONE community.
 *
 * Unscoped because `auth.users` lives outside the tenant schema and has no
 * `community_id`. The query is anchored on `user_roles.community_id = $1`, so
 * it can only ever return rows for that community's own members.
 */
export async function findCommunityResidentPortalActivity(
  communityId: number,
): Promise<Map<string, ResidentPortalActivityRow>> {
  // Invitations are aggregated ONCE for the community and joined, not looked up
  // per member: a correlated subquery rescanned them for every row —
  // O(members²), ~0.7s warm / 3.4s cold at 2,000 members against ~5ms for this
  // form (same rows, verified with EXCEPT).
  const result = await db.execute(sql`
    WITH members AS (
      SELECT ur.user_id
        FROM public.user_roles ur
       WHERE ur.community_id = ${communityId}
    ),
    invited AS (
      SELECT i.user_id, max(i.created_at) AS last_invited_at
        FROM public.invitations i
       WHERE i.community_id = ${communityId}
         AND i.deleted_at IS NULL
       GROUP BY i.user_id
    )
    SELECT m.user_id AS user_id,
           au.last_sign_in_at AS last_sign_in_at,
           inv.last_invited_at AS last_invited_at
      FROM members m
      LEFT JOIN auth.users au ON au.id = m.user_id
      LEFT JOIN invited inv ON inv.user_id = m.user_id
  `);

  // postgres-js returns a RowList (array); node-pg shape uses { rows: [] }
  const raw = result as unknown;
  const rows = (Array.isArray(raw) ? raw : (raw as { rows?: unknown[] }).rows ?? []) as Array<
    Record<string, unknown>
  >;

  const byUser = new Map<string, ResidentPortalActivityRow>();
  for (const row of rows) {
    const userId = row['user_id'];
    if (typeof userId !== 'string') continue;
    byUser.set(userId, {
      userId,
      lastSignInAt: toDate(row['last_sign_in_at']),
      lastInvitedAt: toDate(row['last_invited_at']),
    });
  }
  return byUser;
}
