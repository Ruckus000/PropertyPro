'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import { walkPaginated } from '@/lib/api/walk-paginated';
import type {
  StormDamageCategory,
  StormDamageReportRecord,
  StormDamageSeverity,
  StormDamageStatus,
} from '@/components/storm-damage/types';

export const stormDamageReportsKey = (communityId: number) =>
  ['storm-damage-reports', communityId] as const;

/**
 * Walk every page of the paginated list endpoint (RLS already scopes rows to
 * what the caller may see). The list is small enough for a client-side walk;
 * there is no server-driven UI pagination in the MVP.
 */
export function useStormDamageReports({
  communityId,
  enabled = true,
}: {
  communityId: number;
  enabled?: boolean;
}) {
  return useQuery<StormDamageReportRecord[]>({
    queryKey: stormDamageReportsKey(communityId),
    queryFn: ({ signal }) =>
      walkPaginated<StormDamageReportRecord>(
        '/api/v1/storm-damage',
        { communityId: String(communityId) },
        { signal },
      ),
    enabled: enabled && communityId > 0,
  });
}

export interface StormDamageReportInput {
  unitId?: number | null;
  occurredAt?: string | null;
  locationLabel: string;
  category: StormDamageCategory;
  severity: StormDamageSeverity;
  description: string;
  photoDocumentIds?: number[];
}

export function useCreateStormDamageReport(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: StormDamageReportInput) =>
      requestJson<StormDamageReportRecord>('/api/v1/storm-damage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: stormDamageReportsKey(communityId) });
    },
  });
}

export function useUpdateStormDamageStatus(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: number; status: StormDamageStatus }) =>
      requestJson<StormDamageReportRecord>('/api/v1/storm-damage', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: stormDamageReportsKey(communityId) });
    },
  });
}
