'use client';

import { useQuery } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

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
    queryKey: ARC_KEYS.list(communityId, filters),
    queryFn: () => {
      const params = new URLSearchParams({
        communityId: String(communityId),
      });
      if (filters?.status) params.set('status', filters.status);
      if (filters?.unitId) params.set('unitId', String(filters.unitId));
      return requestJson<ArcSubmission[]>(`/api/v1/arc?${params}`);
    },
    staleTime: 30_000,
    enabled: communityId > 0,
  });
}
