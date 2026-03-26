import { createAdminClient } from '@propertypro/db/supabase/admin';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuery = any;

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
}

export interface DeletionRequestFilters {
  status?: string | null;
  type?: string | null;
}

function buildRequesterName(rawMeta: Record<string, unknown> | null): string | null {
  if (!rawMeta) {
    return null;
  }

  const firstName = typeof rawMeta.first_name === 'string' ? rawMeta.first_name : '';
  const lastName = typeof rawMeta.last_name === 'string' ? rawMeta.last_name : '';
  return `${firstName} ${lastName}`.trim() || null;
}

function throwIfError(error: { message: string } | null, context: string): void {
  if (error) {
    throw new Error(`${context}: ${error.message}`);
  }
}

function mapDeletionRequests(
  rows: DeletionRequestRow[],
  userMap: Map<string, { email: string; name: string | null }>,
  communityMap: Map<number, string>,
): AdminDeletionRequest[] {
  return rows.map((row) => {
    const userInfo = userMap.get(row.user_id);

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
    };
  });
}

export async function getDeletionRequestsData(
  filters: DeletionRequestFilters = {},
): Promise<{ requests: AdminDeletionRequest[] }> {
  const db = createAdminClient();

  let query = (db.from('account_deletion_requests') as AnyQuery)
    .select('*')
    .order('created_at', { ascending: false });

  if (filters.status && filters.status !== 'all') {
    query = query.eq('status', filters.status);
  }

  if (filters.type && filters.type !== 'all') {
    query = query.eq('request_type', filters.type);
  }

  const { data, error } = await query;
  throwIfError(error, 'Failed to load deletion requests');

  const rows = (data ?? []) as DeletionRequestRow[];
  const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
  const communityIds = [...new Set(rows.map((row) => row.community_id).filter((id): id is number => id !== null))];

  const userMap = new Map<string, { email: string; name: string | null }>();
  const communityMap = new Map<number, string>();

  if (userIds.length > 0) {
    const { data: users, error: usersError } = await (db
      .from('users')
      .select('id, email, raw_user_meta_data')
      .in('id', userIds) as AnyQuery);

    throwIfError(usersError, 'Failed to load requester profiles');

    for (const user of (users ?? []) as {
      id: string;
      email: string;
      raw_user_meta_data: Record<string, unknown> | null;
    }[]) {
      userMap.set(user.id, {
        email: user.email,
        name: buildRequesterName(user.raw_user_meta_data),
      });
    }
  }

  if (communityIds.length > 0) {
    const { data: communities, error: communitiesError } = await (db
      .from('communities')
      .select('id, name')
      .in('id', communityIds) as AnyQuery);

    throwIfError(communitiesError, 'Failed to load community names');

    for (const community of (communities ?? []) as { id: number; name: string }[]) {
      communityMap.set(community.id, community.name);
    }
  }

  return {
    requests: mapDeletionRequests(rows, userMap, communityMap),
  };
}

export const deletionRequestTestUtils = {
  buildRequesterName,
  mapDeletionRequests,
};
