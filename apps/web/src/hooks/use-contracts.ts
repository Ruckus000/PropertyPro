'use client';

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ContractRecord, ExpirationAlert } from '@/components/contracts/types';

/**
 * TanStack-Query hooks for the contracts API. Replaces the previous
 * `useState + useEffect + fetch + fetchContracts()` pattern in
 * `ContractTable.tsx`.
 *
 * The GET /api/v1/contracts response is non-standard — it returns
 * `{ data: ContractRecord[], alerts: ExpirationAlert[] }` (alerts at the
 * top level alongside data, not nested under data). `requestJson` would
 * unwrap and discard `alerts`, so this hook does its own fetch.
 */

export const contractsKey = (communityId: number) => ['contracts', communityId] as const;

interface ContractsResponse {
  contracts: ContractRecord[];
  alerts: ExpirationAlert[];
}

interface UseContractsOptions {
  communityId: number;
  enabled?: boolean;
}

export function useContracts({ communityId, enabled = true }: UseContractsOptions) {
  return useQuery<ContractsResponse>({
    queryKey: contractsKey(communityId),
    queryFn: async () => {
      const res = await fetch(`/api/v1/contracts?communityId=${communityId}`);
      const json = (await res.json()) as {
        data?: ContractRecord[];
        alerts?: ExpirationAlert[];
        error?: { message?: string };
      };
      if (!res.ok) {
        throw new Error(json.error?.message ?? 'Failed to load contracts');
      }
      return {
        contracts: json.data ?? [],
        alerts: json.alerts ?? [],
      };
    },
    enabled: enabled && communityId > 0,
  });
}

/**
 * Helper for parents (and child mutation components like `<ContractForm />`
 * and `<BidTracker />`) that need to invalidate the contracts cache after
 * an out-of-band write. Replaces the legacy `onSaved={() => fetchContracts()}`
 * callback drilling.
 */
export function useContractsInvalidator(communityId: number) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: contractsKey(communityId) });
  }, [queryClient, communityId]);
}
