'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import type {
  WindMitigationFormType,
  WindMitigationFormVersion,
  WindMitigationReportRecord,
} from '@/components/insurance/types';

/**
 * TanStack-Query hooks for the wind-mitigation locker API.
 *
 * GET /api/v1/wind-mitigation returns the canonical `{ data: ... }` envelope
 * with the list folded inside data: `{ data: { reports: [...] } }`.
 * `requestJson` unwraps the outer `data`, so it returns `{ reports }` — which
 * this hook plucks. Mutations use the standard `{ data: T }` envelope.
 */

export const windMitigationKey = (communityId: number) =>
  ['wind-mitigation', communityId] as const;

interface UseWindMitigationOptions {
  communityId: number;
  enabled?: boolean;
}

export function useWindMitigationReports({
  communityId,
  enabled = true,
}: UseWindMitigationOptions) {
  return useQuery<WindMitigationReportRecord[]>({
    queryKey: windMitigationKey(communityId),
    queryFn: async () => {
      const { reports } = await requestJson<{ reports: WindMitigationReportRecord[] }>(
        `/api/v1/wind-mitigation?communityId=${communityId}`,
      );
      return reports ?? [];
    },
    enabled: enabled && communityId > 0,
  });
}

export interface CreateWindMitigationReportInput {
  documentId: number;
  formType: WindMitigationFormType;
  formVersion?: WindMitigationFormVersion;
  buildingLabel?: string | null;
  inspectedAt: string;
  expiresAt: string;
  inspectorName?: string | null;
  inspectorLicense?: string | null;
  notes?: string | null;
}

export type UpdateWindMitigationReportInput = Partial<CreateWindMitigationReportInput> & {
  id: number;
};

export function useCreateWindMitigationReport(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateWindMitigationReportInput) =>
      requestJson<WindMitigationReportRecord>('/api/v1/wind-mitigation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: windMitigationKey(communityId) });
    },
  });
}

export function useUpdateWindMitigationReport(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateWindMitigationReportInput) =>
      requestJson<WindMitigationReportRecord>('/api/v1/wind-mitigation', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, ...input }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: windMitigationKey(communityId) });
    },
  });
}

export function useDeleteWindMitigationReport(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) =>
      requestJson<{ deleted: true; id: number }>(
        `/api/v1/wind-mitigation?id=${id}&communityId=${communityId}`,
        { method: 'DELETE' },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: windMitigationKey(communityId) });
    },
  });
}
