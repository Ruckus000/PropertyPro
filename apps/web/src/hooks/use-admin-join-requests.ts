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
}

export function useAdminJoinRequests() {
  return useQuery<PendingRequest[]>({
    queryKey: ADMIN_JOIN_REQUESTS_QUERY_KEY,
    queryFn: ({ signal }) =>
      requestJson<PendingRequest[]>('/api/v1/admin/join-requests', { signal }),
  });
}

export interface ReviewJoinRequestInput {
  id: number;
  action: 'approve' | 'deny';
  notes?: string;
}

export function useReviewJoinRequest() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, ReviewJoinRequestInput>({
    mutationFn: async ({ id, action, notes }) => {
      await requestJson<unknown>(`/api/v1/admin/join-requests/${id}/${action}`, {
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
