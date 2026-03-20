'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

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
  createdAt: string;
  updatedAt: string;
}

export interface VisitorFilters {
  hostUnitId?: number;
  active?: boolean;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export const VISITOR_KEYS = {
  all: ['visitors'] as const,
  list: (communityId: number, filters?: VisitorFilters) =>
    [...VISITOR_KEYS.all, 'list', communityId, filters ?? {}] as const,
  my: (communityId: number) =>
    [...VISITOR_KEYS.all, 'my', communityId] as const,
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

export function useVisitors(communityId: number, filters?: VisitorFilters) {
  return useQuery({
    queryKey: VISITOR_KEYS.list(communityId, filters),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      if (filters?.hostUnitId) params.set('hostUnitId', String(filters.hostUnitId));
      if (filters?.active) params.set('active', 'true');
      return requestJson<VisitorListItem[]>(`/api/v1/visitors?${params.toString()}`);
    },
    enabled: communityId > 0,
  });
}

export function useMyVisitors(communityId: number) {
  return useQuery({
    queryKey: VISITOR_KEYS.my(communityId),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
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
    mutationFn: async (payload: {
      visitorName: string;
      purpose: string;
      hostUnitId: number;
      expectedArrival: string;
      notes?: string | null;
    }) =>
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
