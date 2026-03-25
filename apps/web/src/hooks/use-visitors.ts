'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface VisitorListItem {
  id: number;
  communityId: number;
  visitorName: string;
  purpose: string;
  hostUnitId: number;
  hostUserId: string | null;
  expectedArrival: string;
  checkedInAt: string | null;
  checkedOutAt: string | null;
  passCode?: string;
  staffUserId: string | null;
  notes: string | null;
  guestType: 'one_time' | 'recurring' | 'permanent' | 'vendor';
  validFrom: string | null;
  validUntil: string | null;
  recurrenceRule: string | null;
  expectedDurationMinutes: number | null;
  vehicleMake: string | null;
  vehicleModel: string | null;
  vehicleColor: string | null;
  vehiclePlate: string | null;
  revokedByUserId: string | null;
  revokedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VisitorFilters {
  hostUnitId?: number;
  active?: boolean;
  guestType?: string;
  status?: string;
}

export type MyVisitorFilter = 'active' | 'upcoming' | 'past';

export interface CreateVisitorPayload {
  visitorName: string;
  purpose: string;
  hostUnitId: number;
  expectedArrival?: string;
  notes?: string | null;
  guestType?: 'one_time' | 'recurring' | 'permanent' | 'vendor';
  validFrom?: string | null;
  validUntil?: string | null;
  recurrenceRule?: string | null;
  expectedDurationMinutes?: number | null;
  vehicleMake?: string | null;
  vehicleModel?: string | null;
  vehicleColor?: string | null;
  vehiclePlate?: string | null;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const VISITOR_KEYS = {
  all: ['visitors'] as const,
  list: (communityId: number, filters?: VisitorFilters) =>
    [...VISITOR_KEYS.all, 'list', communityId, filters ?? {}] as const,
  my: (communityId: number, filter?: MyVisitorFilter) =>
    [...VISITOR_KEYS.all, 'my', communityId, filter ?? 'default'] as const,
};

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export function useVisitors(communityId: number, filters?: VisitorFilters) {
  return useQuery({
    queryKey: VISITOR_KEYS.list(communityId, filters),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      if (filters?.hostUnitId) params.set('hostUnitId', String(filters.hostUnitId));
      if (filters?.active) params.set('active', 'true');
      if (filters?.guestType) params.set('guestType', filters.guestType);
      if (filters?.status) params.set('status', filters.status);
      return requestJson<VisitorListItem[]>(`/api/v1/visitors?${params.toString()}`);
    },
    enabled: communityId > 0,
  });
}

export function useMyVisitors(communityId: number, filter?: MyVisitorFilter) {
  return useQuery({
    queryKey: VISITOR_KEYS.my(communityId, filter),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      if (filter) params.set('filter', filter);
      return requestJson<VisitorListItem[]>(`/api/v1/visitors/my?${params.toString()}`);
    },
    enabled: communityId > 0,
  });
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

export function useCreateVisitor(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateVisitorPayload) =>
      requestJson<VisitorListItem>('/api/v1/visitors', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: VISITOR_KEYS.all });
    },
  });
}

export function useRevokeVisitor(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      visitorId,
      reason,
    }: {
      visitorId: number;
      reason?: string;
    }) =>
      requestJson<VisitorListItem>(`/api/v1/visitors/${visitorId}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, reason }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: VISITOR_KEYS.all });
    },
  });
}

export function useCheckinVisitor(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (visitorId: number) =>
      requestJson<VisitorListItem>(
        `/api/v1/visitors/${visitorId}/checkin`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId }),
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: VISITOR_KEYS.all });
    },
  });
}

export function useCheckoutVisitor(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (visitorId: number) =>
      requestJson<VisitorListItem>(
        `/api/v1/visitors/${visitorId}/checkout`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ communityId }),
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: VISITOR_KEYS.all });
    },
  });
}
