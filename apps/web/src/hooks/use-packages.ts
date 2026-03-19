'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PackageListItem {
  id: number;
  communityId: number;
  unitId: number;
  recipientName: string;
  carrier: string;
  trackingNumber: string | null;
  status: 'received' | 'notified' | 'picked_up';
  receivedByStaffId: string | null;
  pickedUpAt: string | null;
  pickedUpByName: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PackageFilters {
  status?: 'received' | 'notified' | 'picked_up';
  unitId?: number;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const PACKAGE_KEYS = {
  all: ['packages'] as const,
  list: (communityId: number, filters?: PackageFilters) =>
    [...PACKAGE_KEYS.all, 'list', communityId, filters ?? {}] as const,
  my: (communityId: number) =>
    [...PACKAGE_KEYS.all, 'my', communityId] as const,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function requestJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  const json = (await response.json()) as {
    data?: T;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(json.error?.message ?? 'Request failed');
  }

  if (json.data === undefined) {
    throw new Error('Missing response payload');
  }

  return json.data;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function usePackages(communityId: number, filters?: PackageFilters) {
  return useQuery({
    queryKey: PACKAGE_KEYS.list(communityId, filters),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      if (filters?.status) params.set('status', filters.status);
      if (filters?.unitId) params.set('unitId', String(filters.unitId));
      return requestJson<PackageListItem[]>(`/api/v1/packages?${params.toString()}`);
    },
    enabled: communityId > 0,
  });
}

export function useMyPackages(communityId: number) {
  return useQuery({
    queryKey: PACKAGE_KEYS.my(communityId),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      return requestJson<PackageListItem[]>(`/api/v1/packages/my?${params.toString()}`);
    },
    enabled: communityId > 0,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreatePackage(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      unitId: number;
      recipientName: string;
      carrier: string;
      trackingNumber?: string | null;
      notes?: string | null;
    }) =>
      requestJson<PackageListItem>('/api/v1/packages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PACKAGE_KEYS.all });
    },
  });
}

export function usePickupPackage(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: {
      packageId: number;
      pickedUpByName: string;
    }) =>
      requestJson<PackageListItem>(
        `/api/v1/packages/${payload.packageId}/pickup`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            communityId,
            pickedUpByName: payload.pickedUpByName,
          }),
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PACKAGE_KEYS.all });
    },
  });
}
