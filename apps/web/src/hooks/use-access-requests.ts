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
