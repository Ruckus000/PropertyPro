'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import { walkPaginated } from '@/lib/api/walk-paginated';

export const ACCESS_REQUESTS_QUERY_KEY = ['access-requests'] as const;

export interface AccessRequest {
  id: number;
  communityId: number;
  fullName: string;
  email: string;
  claimedUnitIdentifier: string | null;
  claimedUnitId: number | null;
  isUnitOwner: boolean;
  status: 'pending' | 'approved' | 'denied';
  createdAt: string;
}

/**
 * The admin review surface needs the full pending-request list to render.
 * Walks the cursor-based pagination contract via the canonical
 * `walkPaginated()` helper (Plan B3) until `hasMore` is false. The TanStack
 * Query `signal` is forwarded so a stale request is cancelled at the network
 * layer if the query is invalidated mid-walk.
 */
async function fetchAccessRequests(
  communityId: number,
  signal?: AbortSignal,
): Promise<AccessRequest[]> {
  return walkPaginated<AccessRequest>(
    '/api/v1/access-requests',
    { communityId: String(communityId) },
    { signal },
  );
}

/**
 * Shared query definition, so the sidebar's Directory badge, the Directory's
 * request count and the request list read one cache entry (and an
 * approve/deny invalidation updates all three). Lives here, not in the list
 * component, so the sidebar can use it without pulling the list into every page.
 */
export function accessRequestsQueryOptions(communityId: number) {
  return {
    queryKey: ['access-requests', communityId] as const,
    queryFn: ({ signal }: { signal?: AbortSignal }) => fetchAccessRequests(communityId, signal),
  };
}

export interface ApproveAccessRequestInput {
  requestId: number;
  unitId?: number;
}

export interface ApproveAccessRequestResult {
  userId: string;
}

export interface DenyAccessRequestInput {
  requestId: number;
  reason?: string;
}

export interface DenyAccessRequestResult {
  success: true;
}

export function useApproveAccessRequest() {
  const queryClient = useQueryClient();

  return useMutation<ApproveAccessRequestResult, Error, ApproveAccessRequestInput>({
    mutationFn: ({ requestId, unitId }) =>
      requestJson<ApproveAccessRequestResult>(
        `/api/v1/access-requests/${requestId}/approve`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ unitId: unitId ?? undefined }),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCESS_REQUESTS_QUERY_KEY });
    },
  });
}

export function useDenyAccessRequest() {
  const queryClient = useQueryClient();

  return useMutation<DenyAccessRequestResult, Error, DenyAccessRequestInput>({
    mutationFn: ({ requestId, reason }) =>
      requestJson<DenyAccessRequestResult>(
        `/api/v1/access-requests/${requestId}/deny`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: reason?.trim() || undefined }),
        },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCESS_REQUESTS_QUERY_KEY });
    },
  });
}
