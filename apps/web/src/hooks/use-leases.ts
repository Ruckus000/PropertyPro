'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Raw shape returned from /api/v1/leases — matches API exactly, no enrichment */
export interface LeaseApiItem {
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

/**
 * @deprecated Use LeaseApiItem. This alias exists for backward compatibility
 * during migration; remove once all consumers are updated.
 */
export type LeaseListItem = LeaseApiItem;

/** UI-only type created by useEnrichedLeases — never returned from the API */
export interface EnrichedLeaseListItem extends LeaseApiItem {
  unitNumber: string | null;    // null while enrichment in-flight or failed
  residentName: string | null;
  residentEmail: string | null;
}

/** Discriminated union for DataTable rows — lease rows and vacant unit rows */
export type LeaseTableRow =
  | { kind: 'lease'; lease: EnrichedLeaseListItem }
  | { kind: 'vacant'; unitId: number; unitNumber: string };

export interface LeaseFilters {
  status?: string;
  unit?: number;
  expiring_within_days?: number;
}

export interface UnitItem {
  id: number;
  communityId: number;
  unitNumber: string;
}

export interface ResidentItem {
  id: string;
  name: string;
  email: string;
}

export interface EnrichedLeasesResult {
  leases: EnrichedLeaseListItem[];
  units: UnitItem[];
  isLoading: boolean;       // true while primary leases query in-flight
  isEnriching: boolean;     // true while units/residents lookups in-flight
  isError: boolean;         // true only if the primary leases query failed
  hasEnrichmentError: boolean; // true if units or residents fetch failed (names degrade to null)
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
  units: (communityId: number) => ['units', communityId] as const,
  residents: (communityId: number) => ['residents', communityId] as const,
};

// ---------------------------------------------------------------------------
// Base queries
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
      return requestJson<LeaseApiItem[]>(`/api/v1/leases?${params.toString()}`);
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
      return requestJson<LeaseApiItem[]>(`/api/v1/leases?${params.toString()}`);
    },
    enabled: communityId > 0 && leaseId !== null,
  });
}

export function useUnits(communityId: number) {
  return useQuery({
    queryKey: LEASE_KEYS.units(communityId),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      return requestJson<UnitItem[]>(`/api/v1/units?${params.toString()}`);
    },
    enabled: communityId > 0,
  });
}

export function useResidentList(communityId: number) {
  return useQuery({
    queryKey: LEASE_KEYS.residents(communityId),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      return requestJson<ResidentItem[]>(`/api/v1/residents?${params.toString()}`);
    },
    enabled: communityId > 0,
  });
}

// ---------------------------------------------------------------------------
// Enriched hook
// ---------------------------------------------------------------------------

export function useEnrichedLeases(communityId: number): EnrichedLeasesResult {
  const leasesQuery = useLeases(communityId);
  const unitsQuery = useUnits(communityId);
  const residentsQuery = useResidentList(communityId);

  const unitMap = useMemo(() => {
    const m = new Map<number, string>();
    for (const u of unitsQuery.data ?? []) {
      m.set(u.id, u.unitNumber);
    }
    return m;
  }, [unitsQuery.data]);

  const residentMap = useMemo(() => {
    const m = new Map<string, { name: string; email: string }>();
    for (const r of residentsQuery.data ?? []) {
      m.set(r.id, { name: r.name, email: r.email });
    }
    return m;
  }, [residentsQuery.data]);

  const enrichedLeases = useMemo<EnrichedLeaseListItem[]>(() => {
    return (leasesQuery.data ?? []).map((lease) => ({
      ...lease,
      unitNumber: unitMap.get(lease.unitId) ?? null,
      residentName: residentMap.get(lease.residentId)?.name ?? null,
      residentEmail: residentMap.get(lease.residentId)?.email ?? null,
    }));
  }, [leasesQuery.data, unitMap, residentMap]);

  const isLoading = leasesQuery.isLoading;
  const isEnriching = !isLoading && (unitsQuery.isLoading || residentsQuery.isLoading);
  const isError = leasesQuery.isError;
  const hasEnrichmentError = unitsQuery.isError || residentsQuery.isError;

  return {
    leases: enrichedLeases,
    units: unitsQuery.data ?? [],
    isLoading,
    isEnriching,
    isError,
    hasEnrichmentError,
  };
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
      requestJson<LeaseApiItem>('/api/v1/leases', {
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
      requestJson<LeaseApiItem>('/api/v1/leases', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: LEASE_KEYS.all });
    },
  });
}
