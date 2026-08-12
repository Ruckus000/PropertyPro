'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import { walkPaginated } from '@/lib/api/walk-paginated';

/* ─────── Types ─────── */

export type ArcSubmissionStatus =
  | 'submitted'
  | 'under_review'
  | 'approved'
  | 'denied'
  | 'withdrawn';

export interface ArcSubmission {
  id: number;
  communityId: number;
  unitId: number;
  submittedByUserId: string;
  title: string;
  description: string;
  projectType: string;
  estimatedStartDate: string | null;
  estimatedCompletionDate: string | null;
  attachmentDocumentIds: number[];
  status: ArcSubmissionStatus;
  reviewNotes: string | null;
  decidedByUserId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ArcFilters {
  status?: ArcSubmissionStatus;
  unitId?: number;
}

/* ─────── Query Keys ─────── */

export const ARC_KEYS = {
  all: ['arc'] as const,
  list: (communityId: number, filters?: ArcFilters) =>
    [...ARC_KEYS.all, 'list', communityId, filters ?? {}] as const,
  detail: (communityId: number, id: number) =>
    [...ARC_KEYS.all, 'detail', communityId, id] as const,
};

/* ─────── Hooks ─────── */

export function useArcSubmissions(communityId: number, filters?: ArcFilters) {
  return useQuery({
    // Keep showing the previous page while a filter/page change refetches.
    placeholderData: keepPreviousData,
    queryKey: ARC_KEYS.list(communityId, filters),
    queryFn: ({ signal }) => {
      const baseParams: Record<string, string> = {
        communityId: String(communityId),
      };
      if (filters?.status) baseParams.status = filters.status;
      if (filters?.unitId) baseParams.unitId = String(filters.unitId);
      return walkPaginated<ArcSubmission>('/api/v1/arc', baseParams, { signal });
    },
    staleTime: 30_000,
    enabled: communityId > 0,
  });
}

/* ─────── Mutations ─────── */

/**
 * The write half of the ARC loop. Until #933 this file had queries only, so
 * every ARC endpoint below the list was reachable by API and by nothing else —
 * the routes, the service state machine, the audit logging and the decision
 * email all existed and shipped with no way for a resident or a reviewer to
 * invoke them.
 *
 * Each mutation invalidates `ARC_KEYS.all` rather than a narrower key: a
 * decision moves a row between status filters, so the tab counts and every
 * cached filter view go stale together.
 */
function useArcMutation<TPayload>(
  communityId: number,
  request: (payload: TPayload) => Promise<unknown>,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: request,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ARC_KEYS.all });
    },
  });
}

export interface CreateArcSubmissionPayload {
  unitId: number;
  title: string;
  description: string;
  projectType: string;
  estimatedStartDate?: string | null;
  estimatedCompletionDate?: string | null;
  attachmentDocumentIds?: number[];
}

export function useCreateArcSubmission(communityId: number) {
  return useArcMutation<CreateArcSubmissionPayload>(communityId, (payload) =>
    requestJson<ArcSubmission>('/api/v1/arc', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId, ...payload }),
    }),
  );
}

export function useReviewArcSubmission(communityId: number) {
  return useArcMutation<{ id: number; reviewNotes?: string | null }>(
    communityId,
    ({ id, reviewNotes }) =>
      requestJson<ArcSubmission>(`/api/v1/arc/${id}/review`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, reviewNotes }),
      }),
  );
}

export function useDecideArcSubmission(communityId: number) {
  return useArcMutation<{
    id: number;
    decision: 'approved' | 'denied';
    reviewNotes?: string | null;
  }>(communityId, ({ id, decision, reviewNotes }) =>
    requestJson<ArcSubmission>(`/api/v1/arc/${id}/decide`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId, decision, reviewNotes }),
    }),
  );
}

export function useWithdrawArcSubmission(communityId: number) {
  return useArcMutation<{ id: number }>(communityId, ({ id }) =>
    requestJson<ArcSubmission>(`/api/v1/arc/${id}/withdraw`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId }),
    }),
  );
}
