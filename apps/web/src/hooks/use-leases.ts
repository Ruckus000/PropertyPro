'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LeaseListItem {
  id: number;
  communityId: number;
  unitId: number;
  residentId: string;
  startDate: string;
  endDate: string | null;
  rentAmount: string | null;
  status: string;
  previousLeaseId: number | null;
  notes: string | null;
}

export interface LeaseFilters {
  status?: string;
  unit?: number;
  expiring_within_days?: number;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const LEASE_KEYS = {
  all: ['leases'] as const,
  list: (communityId: number, filters?: LeaseFilters) =>
    [...LEASE_KEYS.all, 'list', communityId, filters ?? {}] as const,
  renewalChain: (communityId: number, leaseId: number) =>
    [...LEASE_KEYS.all, 'chain', communityId, leaseId] as const,
};


// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useLeases(communityId: number, filters?: LeaseFilters) {
  return useQuery({
    queryKey: LEASE_KEYS.list(communityId, filters),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      if (filters?.status) params.set('status', filters.status);
      if (filters?.unit) params.set('unit', String(filters.unit));
      if (filters?.expiring_within_days) {
        params.set('expiring_within_days', String(filters.expiring_within_days));
      }
      return requestJson<LeaseListItem[]>(`/api/v1/leases?${params.toString()}`);
    },
    enabled: communityId > 0,
  });
}

export function useRenewalChain(communityId: number, leaseId: number | null) {
  return useQuery({
    queryKey: leaseId
      ? LEASE_KEYS.renewalChain(communityId, leaseId)
      : [...LEASE_KEYS.all, 'chain', communityId, 'none'] as const,
    queryFn: async () => {
      const params = new URLSearchParams({
        communityId: String(communityId),
        renewal_chain_for: String(leaseId),
      });
      return requestJson<LeaseListItem[]>(`/api/v1/leases?${params.toString()}`);
    },
    enabled: communityId > 0 && leaseId !== null,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateLease(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      unitId: number;
      residentId: string;
      startDate: string;
      endDate?: string | null;
      rentAmount?: string | null;
      notes?: string | null;
      isRenewal?: boolean;
      previousLeaseId?: number | null;
    }) =>
      requestJson<LeaseListItem>('/api/v1/leases', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: LEASE_KEYS.all });
    },
  });
}

export function useUpdateLease(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      id: number;
      status?: string;
      endDate?: string | null;
      rentAmount?: string | null;
      notes?: string | null;
    }) =>
      requestJson<LeaseListItem>('/api/v1/leases', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: LEASE_KEYS.all });
    },
  });
}
