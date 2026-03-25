'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export interface DeniedVisitorListItem {
  id: number;
  communityId: number;
  fullName: string;
  reason: string;
  deniedByUserId: string | null;
  vehiclePlate: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeniedMatchItem {
  id: number;
  fullName: string;
  vehiclePlate: string | null;
  reason: string;
  isActive: boolean;
}

export interface CreateDeniedVisitorPayload {
  fullName: string;
  reason: string;
  vehiclePlate?: string | null;
  notes?: string | null;
}

export interface UpdateDeniedVisitorPayload {
  deniedId: number;
  fullName?: string;
  reason?: string;
  vehiclePlate?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

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

export async function fetchDeniedMatches(
  communityId: number,
  name: string | null,
  plate: string | null,
): Promise<DeniedMatchItem[]> {
  const params = new URLSearchParams({ communityId: String(communityId) });
  if (name?.trim()) params.set('name', name.trim());
  if (plate?.trim()) params.set('plate', plate.trim());

  return requestJson<DeniedMatchItem[]>(`/api/v1/visitors/denied/match?${params.toString()}`);
}

export const DENIED_VISITOR_KEYS = {
  all: ['denied-visitors'] as const,
  list: (communityId: number, active?: boolean) =>
    [...DENIED_VISITOR_KEYS.all, 'list', communityId, active ?? 'all'] as const,
  match: (communityId: number, name: string | null, plate: string | null) =>
    [...DENIED_VISITOR_KEYS.all, 'match', communityId, name ?? '', plate ?? ''] as const,
};

export function useDeniedVisitors(communityId: number, active?: boolean) {
  return useQuery({
    queryKey: DENIED_VISITOR_KEYS.list(communityId, active),
    queryFn: async () => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      if (active !== undefined) params.set('active', String(active));
      return requestJson<DeniedVisitorListItem[]>(`/api/v1/visitors/denied?${params.toString()}`);
    },
    enabled: communityId > 0,
  });
}

export function useDeniedMatch(
  communityId: number,
  name: string | null,
  plate: string | null,
) {
  return useQuery({
    queryKey: DENIED_VISITOR_KEYS.match(communityId, name, plate),
    queryFn: () => fetchDeniedMatches(communityId, name, plate),
    enabled: communityId > 0 && Boolean(name?.trim() || plate?.trim()),
  });
}

export function useCreateDeniedVisitor(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateDeniedVisitorPayload) =>
      requestJson<DeniedVisitorListItem>('/api/v1/visitors/denied', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DENIED_VISITOR_KEYS.all });
    },
  });
}

export function useUpdateDeniedVisitor(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ deniedId, ...payload }: UpdateDeniedVisitorPayload) =>
      requestJson<DeniedVisitorListItem>(`/api/v1/visitors/denied/${deniedId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, ...payload }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DENIED_VISITOR_KEYS.all });
    },
  });
}

export function useDeleteDeniedVisitor(communityId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (deniedId: number) =>
      requestJson<{ success: true }>(`/api/v1/visitors/denied/${deniedId}`, {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: DENIED_VISITOR_KEYS.all });
    },
  });
}
