'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export const ADMIN_JOIN_REQUESTS_QUERY_KEY = ['admin-join-requests'] as const;

export interface PendingRequest {
  id: number;
  userId: string;
  communityId: number;
  unitIdentifier: string;
  residentType: 'owner' | 'tenant' | string;
  status: string;
  createdAt: string;
  /** Approving links this unit (the claimed number is on the roster). */
  unitOnRoster?: boolean;
  requesterName?: string | null;
  requesterEmail?: string | null;
}

/**
 * `?communityId=` names the community where no tenant subdomain does (the PM
 * and apex hosts); without it these routes answer 400 there. Middleware turns
 * it into the `x-community-id` header the routes read.
 */
function withCommunity(path: string, communityId?: number): string {
  return communityId === undefined ? path : `${path}?communityId=${communityId}`;
}

export function useAdminJoinRequests(options: { communityId?: number; enabled?: boolean } = {}) {
  return useQuery<PendingRequest[]>({
    queryKey: [...ADMIN_JOIN_REQUESTS_QUERY_KEY, options.communityId ?? null],
    queryFn: ({ signal }) =>
      requestJson<PendingRequest[]>(withCommunity('/api/v1/admin/join-requests', options.communityId), {
        signal,
      }),
    enabled: options.enabled ?? true,
  });
}

export interface ReviewJoinRequestInput {
  id: number;
  action: 'approve' | 'deny';
  notes?: string;
}

export function useReviewJoinRequest(communityId?: number) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, ReviewJoinRequestInput>({
    mutationFn: async ({ id, action, notes }) => {
      await requestJson<unknown>(withCommunity(`/api/v1/admin/join-requests/${id}/${action}`, communityId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: ADMIN_JOIN_REQUESTS_QUERY_KEY,
      });
    },
  });
}
