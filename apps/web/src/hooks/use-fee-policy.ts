'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PaymentFeePolicy } from '@propertypro/shared';
import { requestJson } from '@/lib/api/request-json';

export const FEE_POLICY_QUERY_KEY = (communityId: number) =>
  ['fee-policy', communityId] as const;

export function useFeePolicy(communityId: number) {
  return useQuery<PaymentFeePolicy>({
    queryKey: FEE_POLICY_QUERY_KEY(communityId),
    enabled: communityId > 0,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      const data = await requestJson<{ feePolicy: PaymentFeePolicy }>(
        `/api/v1/payments/fee-policy?${params.toString()}`,
        { signal },
      );
      return data.feePolicy;
    },
  });
}

export function useUpdateFeePolicy(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation<PaymentFeePolicy, Error, PaymentFeePolicy>({
    // Documented exception to the requestJson rule: the component renders the
    // thrown message verbatim and relies on the exact fallback literal
    // 'Failed to update fee policy'. requestJson's fallback is 'Request
    // failed', which would silently change user-visible copy.
    mutationFn: async (feePolicy) => {
      const res = await fetch('/api/v1/payments/fee-policy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, feePolicy }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error?.message || 'Failed to update fee policy');
      }
      const json = await res.json();
      return json.data.feePolicy as PaymentFeePolicy;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: FEE_POLICY_QUERY_KEY(communityId),
      });
    },
  });
}
