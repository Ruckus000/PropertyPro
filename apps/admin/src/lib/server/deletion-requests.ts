import { createAdminTypedClient } from '@propertypro/db/supabase/admin';
import type { AccountDeletionRequestRow } from '@propertypro/db/supabase/admin-types';
import { COMMUNITY_LIST_LIMIT } from '@/lib/api/list-limits';

export type DeletionStatus = 'cooling' | 'soft_deleted' | 'purged' | 'cancelled' | 'recovered';
export type RequestType = 'user' | 'community';

interface DeletionRequestRow {
  id: number;
  request_type: RequestType;
  user_id: string;
  community_id: number | null;
  status: DeletionStatus;
  cooling_ends_at: string;
  scheduled_purge_at: string | null;
  purged_at: string | null;
  cancelled_at: string | null;
  recovered_at: string | null;
  intervention_notes: string | null;
  created_at: string;
}

export interface AdminDeletionRequest {
  id: number;
  requestType: RequestType;
  userId: string;
  communityId: number | null;
  status: DeletionStatus;
  coolingEndsAt: string;
  scheduledPurgeAt: string | null;
  purgedAt: string | null;
  cancelledAt: string | null;
  recoveredAt: string | null;
  interventionNotes: string | null;
  createdAt: string;
  requesterEmail: string | null;
  requesterName: string | null;
  communityName: string | null;
  /**
   * Whether the request's target (the user's account, or the community) is
   * deleted right now; null when it could not be looked up. A `soft_deleted`
   * request whose target is NOT deleted is stale (left by an earlier recovery
   * or a released claim) and has nothing to recover. See
   * `deletionRequestDisplayState`.
   */
  targetDeleted: boolean | null;
}

export interface DeletionRequestFilters {
  status?: string | null;
  type?: string | null;
}

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function mapDeletionRequests(
  rows: DeletionRequestRow[],
  userMap: Map<string, { email: string; name: string | null; deleted?: boolean }>,
  communityMap: Map<number, string>,
  communityDeleted: Map<number, boolean> = new Map(),
): AdminDeletionRequest[] {
  return rows.map((row) => {
    const userInfo = userMap.get(row.user_id);
    const targetDeleted =
      row.request_type === 'community'
        ? row.community_id === null
          ? null
          : communityDeleted.get(row.community_id) ?? null
        : userInfo?.deleted ?? null;

    return {
      id: row.id,
      requestType: row.request_type,
      userId: row.user_id,
      communityId: row.community_id,
      status: row.status,
      coolingEndsAt: row.cooling_ends_at,
      scheduledPurgeAt: row.scheduled_purge_at,
      purgedAt: row.purged_at,
      cancelledAt: row.cancelled_at,
      recoveredAt: row.recovered_at,
      interventionNotes: row.intervention_notes,
      createdAt: row.created_at,
      requesterEmail: userInfo?.email ?? null,
      requesterName: userInfo?.name ?? null,
      communityName: row.community_id ? communityMap.get(row.community_id) ?? null : null,
      targetDeleted,
    };
  });
}

export async function getDeletionRequestsData(
  filters: DeletionRequestFilters = {},
): Promise<{ requests: AdminDeletionRequest[] }> {
  const db = createAdminTypedClient();

  let query = (db.from('account_deletion_requests'))
    .select('*')
    .order('created_at', { ascending: false })
    .limit(COMMUNITY_LIST_LIMIT);

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status as AccountDeletionRequestRow['status']);
  }

  if (filters.type && filters.type !== 'all') {
    query = query.eq('request_type', filters.type as AccountDeletionRequestRow['request_type']);
  }

  const { data, error } = await query;
  throwIfError(error, 'Failed to load deletion requests');

  const rows = (data ?? []) as DeletionRequestRow[];
  const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
  const communityIds = [...new Set(rows.map((row) => row.community_id).filter((id): id is number => id !== null))];

  const userMap = new Map<string, { email: string; name: string | null; deleted?: boolean }>();
  const communityMap = new Map<number, string>();
  const communityDeleted = new Map<number, boolean>();

  if (userIds.length > 0) {
    const { data: users, error: usersError } = await (db
      .from('users')
      .select('id, email, full_name, deleted_at')
      .in('id', userIds));

    throwIfError(usersError, 'Failed to load requester profiles');

    for (const user of (users ?? []) as { id: string; email: string; full_name: string | null; deleted_at?: string | null }[]) {
      userMap.set(user.id, {
        email: user.email,
        name: user.full_name || null,
        // undefined (not selected) stays unknown rather than "not deleted".
        ...(user.deleted_at === undefined ? {} : { deleted: user.deleted_at !== null }),
      });
    }
  }

  if (communityIds.length > 0) {
    // This read is a NAME LOOKUP, not a population count: `communityIds` is
    // already the exact set of communities named by the deletion requests just
    // fetched, and the query only maps each id to its display name (and to
    // whether it is deleted now, which tells a live request from a stale one). Filtering
    // `is_demo` / `deleted_at` the way every other `communities` read here does
    // would blank the precise rows this screen exists to show — a community
    // deletion request that has reached `soft_deleted` has `deleted_at` set by
    // definition, and demo communities are exactly what an operator expiring a
    // demo is looking at. The row would drop out of `communityMap` and the
    // request would render with no community name at all.
    // admin-community-scope:exempt — display-name lookup keyed by the request rows' own community ids; a soft-deleted or demo community is the subject of the request, so excluding it would blank the row
    const { data: communities, error: communitiesError } = await (db
      .from('communities')
      .select('id, name, deleted_at')
      .in('id', communityIds));

    throwIfError(communitiesError, 'Failed to load community names');

    for (const community of (communities ?? []) as { id: number; name: string; deleted_at?: string | null }[]) {
      communityMap.set(community.id, community.name);
      if (community.deleted_at !== undefined) {
        communityDeleted.set(community.id, community.deleted_at !== null);
      }
    }
  }

  return {
    requests: mapDeletionRequests(rows, userMap, communityMap, communityDeleted),
  };
}

export const deletionRequestTestUtils = {
  mapDeletionRequests,
};
