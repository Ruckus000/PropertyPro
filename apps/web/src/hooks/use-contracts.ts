'use client';

import { useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import type { ContractRecord, ExpirationAlert } from '@/components/contracts/types';

/**
 * TanStack-Query hooks for the contracts API. Replaces the previous
 * `useState + useEffect + fetch + fetchContracts()` pattern in
 * `ContractTable.tsx`, plus the inline POST/PATCH `fetch` calls in
 * `ContractForm.tsx` and `BidTracker.tsx`.
 *
 * The GET /api/v1/contracts response is non-standard — it returns
 * `{ data: ContractRecord[], alerts: ExpirationAlert[] }` (alerts at the
 * top level alongside data, not nested under data). `requestJson` would
 * unwrap and discard `alerts`, so the read hook does its own fetch.
 *
 * The mutation hooks below talk to the same endpoint but use the standard
 * `{ data: T }` envelope, so they go through `requestJson`.
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
 * Helper for parents that need to invalidate the contracts cache after an
 * out-of-band write that does not flow through the mutation hooks below.
 * The mutation hooks self-invalidate on success, so most callers don't need
 * this — it's kept exported for parity with the documents/announcements
 * pattern and as an escape hatch.
 */
export function useContractsInvalidator(communityId: number) {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: contractsKey(communityId) });
  }, [queryClient, communityId]);
}

// ---------------------------------------------------------------------------
// Mutations — POST/PATCH /api/v1/contracts
// ---------------------------------------------------------------------------
//
// Each mutation invalidates the contracts query for `communityId` on success
// so the list refreshes without callback-drilling `onSaved` → `fetchContracts`.

export interface CreateContractInput {
  title: string;
  vendorName: string;
  description?: string | null;
  contractValue?: string | null;
  startDate: string;
  endDate?: string | null;
  biddingClosesAt?: string | null;
  conflictOfInterest?: boolean;
  documentId?: number | null;
  complianceChecklistItemId?: number | null;
}

export type UpdateContractInput = CreateContractInput & { id: number };

export interface AddBidInput {
  contractId: number;
  vendorName: string;
  bidAmount: string;
  notes?: string | null;
}

export function useCreateContract(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateContractInput) =>
      requestJson<ContractRecord>('/api/v1/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: contractsKey(communityId) });
    },
  });
}

export function useUpdateContract(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateContractInput) =>
      requestJson<ContractRecord>('/api/v1/contracts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: contractsKey(communityId) });
    },
  });
}

export function useAddContractBid(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddBidInput) =>
      requestJson<{ id: number; vendorName: string; bidAmount: string }>('/api/v1/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'add_bid', communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: contractsKey(communityId) });
    },
  });
}
