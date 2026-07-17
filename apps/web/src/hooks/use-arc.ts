'use client';

import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
