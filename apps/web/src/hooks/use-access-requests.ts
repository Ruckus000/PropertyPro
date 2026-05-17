'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export const ACCESS_REQUESTS_QUERY_KEY = ['access-requests'] as const;

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
