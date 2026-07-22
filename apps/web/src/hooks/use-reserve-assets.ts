'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import { walkPaginated } from '@/lib/api/walk-paginated';
import type { ReserveAssetCategory, ReserveAssetRecord } from '@/components/reserves/types';

/**
 * TanStack-Query hooks for the reserve-transparency register API.
 *
 * GET /api/v1/reserve-assets is paginated (canonical keyset envelope). The
 * register is small (a handful of major components), so the list hook walks all
 * pages via `walkPaginated` and returns the flat array. Mutations use the
 * standard `{ data: T }` envelope.
 */

export const reserveAssetsKey = (communityId: number) => ['reserve-assets', communityId] as const;

interface UseReserveAssetsOptions {
  communityId: number;
  enabled?: boolean;
}

export function useReserveAssets({ communityId, enabled = true }: UseReserveAssetsOptions) {
  return useQuery<ReserveAssetRecord[]>({
    queryKey: reserveAssetsKey(communityId),
    queryFn: async ({ signal }) =>
      walkPaginated<ReserveAssetRecord>(
        '/api/v1/reserve-assets',
        { communityId: String(communityId) },
        { signal },
      ),
    enabled: enabled && communityId > 0,
  });
}

export interface CreateReserveAssetInput {
  name: string;
  category: ReserveAssetCategory;
  yearInstalled: number;
  usefulLifeYears: number;
  replacementCostCents?: number | null;
  currentReserveCents?: number | null;
  notes?: string | null;
}

export type UpdateReserveAssetInput = Partial<CreateReserveAssetInput> & { id: number };

export function useCreateReserveAsset(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateReserveAssetInput) =>
      requestJson<ReserveAssetRecord>('/api/v1/reserve-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reserveAssetsKey(communityId) });
    },
  });
}

export function useUpdateReserveAsset(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateReserveAssetInput) =>
      requestJson<ReserveAssetRecord>('/api/v1/reserve-assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reserveAssetsKey(communityId) });
    },
  });
}

export function useDeleteReserveAsset(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      requestJson<{ deleted: true; id: number }>(
        `/api/v1/reserve-assets?id=${id}&communityId=${communityId}`,
        { method: 'DELETE' },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: reserveAssetsKey(communityId) });
    },
  });
}
