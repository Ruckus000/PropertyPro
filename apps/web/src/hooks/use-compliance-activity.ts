'use client';

import { useQuery } from '@tanstack/react-query';

export interface AuditEntry {
  id: number;
  userId: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string; // ISO
}

export interface ActivityFeedResponse {
  data: AuditEntry[];
  pagination: {
    nextCursor: string | null;
    hasMore: boolean;
  };
  users: Record<string, string>;
}

interface ActivityFeedEnvelope {
  data: ActivityFeedResponse | AuditEntry[];
  pagination?: ActivityFeedResponse['pagination'];
  users?: Record<string, string>;
}

export class ActivityFetchError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function isAuditEntry(value: unknown): value is AuditEntry {
  const entry = value as Partial<AuditEntry>;
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof entry.id === 'number' &&
    (typeof entry.userId === 'string' || entry.userId === null) &&
    typeof entry.action === 'string' &&
    typeof entry.resourceType === 'string' &&
    typeof entry.resourceId === 'string' &&
    (entry.metadata === null ||
      (typeof entry.metadata === 'object' && !Array.isArray(entry.metadata))) &&
    typeof entry.createdAt === 'string'
  );
}

export function normalizeActivityFeedResponse(
  payload: unknown,
): ActivityFeedResponse {
  const envelope = payload as ActivityFeedEnvelope;
  const inner = envelope?.data;

  if (Array.isArray(inner)) {
    return {
      data: inner.filter(isAuditEntry),
      pagination: envelope.pagination ?? { nextCursor: null, hasMore: false },
      users: envelope.users ?? {},
    };
  }

  if (inner && typeof inner === 'object' && Array.isArray(inner.data)) {
    return {
      data: inner.data.filter(isAuditEntry),
      pagination: inner.pagination ?? { nextCursor: null, hasMore: false },
      users: inner.users ?? {},
    };
  }

  throw new ActivityFetchError(200, 'Invalid activity response');
}

export const COMPLIANCE_ACTIVITY_QUERY_KEY = (communityId: number) =>
  ['compliance-activity', communityId] as const;

export function useComplianceActivityFeed(communityId: number) {
  return useQuery<ActivityFeedResponse, ActivityFetchError>({
    queryKey: COMPLIANCE_ACTIVITY_QUERY_KEY(communityId),
    // Documented exception to the requestJson rule: the component branches on
    // the HTTP status (403 → hide the whole panel) via ActivityFetchError.status,
    // and the route returns a non-standard double/triple-wrapped envelope that
    // requires normalizeActivityFeedResponse. requestJson exposes neither the
    // status code nor the raw envelope, so raw fetch + bespoke parsing is kept.
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({
        communityId: String(communityId),
        limit: '8',
      });
      const res = await fetch(`/api/v1/audit-trail?${params.toString()}`, {
        signal,
      });
      if (!res.ok) {
        throw new ActivityFetchError(res.status, 'Failed to load activity');
      }
      return normalizeActivityFeedResponse(await res.json());
    },
    staleTime: 2 * 60_000, // 2 minutes
    retry: false,
  });
}
