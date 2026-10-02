import { sql } from 'drizzle-orm';
import { db } from '../drizzle';

export interface ResidentPortalActivityRow {
  userId: string;
  /** Supabase `auth.users.last_sign_in_at` — the only record that someone has actually signed in. */
  lastSignInAt: Date | null;
  /** Newest invitation issued to this user for this community (consumed or not). */
  lastInvitedAt: Date | null;
  /**
   * When this community approved the user's access request. Approval creates a
   * loginable account and emails a login link, so it is an invitation in all
   * but name — without it those residents would read "Not invited" forever.
   */
  accessApprovedAt: Date | null;
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
  const result = await db.execute(sql`
    SELECT ur.user_id AS user_id,
           au.last_sign_in_at AS last_sign_in_at,
           (SELECT max(i.created_at)
              FROM public.invitations i
             WHERE i.community_id = ur.community_id
               AND i.user_id = ur.user_id
               AND i.deleted_at IS NULL) AS last_invited_at,
           (SELECT max(ar.reviewed_at)
              FROM public.access_requests ar
             WHERE ar.community_id = ur.community_id
               AND ar.status = 'approved'
               AND ar.deleted_at IS NULL
               AND lower(ar.email) = lower(u.email)) AS access_approved_at
      FROM public.user_roles ur
      JOIN public.users u ON u.id = ur.user_id
      LEFT JOIN auth.users au ON au.id = ur.user_id
     WHERE ur.community_id = ${communityId}
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
      accessApprovedAt: toDate(row['access_approved_at']),
    });
  }
  return byUser;
}
