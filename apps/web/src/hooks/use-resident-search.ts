'use client';

import { useCallback } from 'react';
import { requestJson } from '@/lib/api/request-json';

export interface ResidentSearchResult {
  id: string;
  title: string;
  subtitle: string;
  unitNumber: string | null;
}

export const RESIDENT_SEARCH_FETCH_LIMIT = 10;

export function meetsResidentSearchMinLength(q: string): boolean {
  const trimmed = q.trim();
  if (!trimmed) return false;
  if (/^\d/.test(trimmed)) return trimmed.length >= 1;
  return trimmed.length >= 2;
}

async function searchResidents(
  communityId: number,
  query: string,
  signal: AbortSignal,
): Promise<ResidentSearchResult[]> {
  if (!meetsResidentSearchMinLength(query)) {
    return [];
  }

  const params = new URLSearchParams({
    communityId: String(communityId),
    q: query.trim(),
    limit: String(RESIDENT_SEARCH_FETCH_LIMIT),
  });

  const { results } = await requestJson<{ results?: ResidentSearchResult[] }>(
    `/api/v1/search/residents?${params.toString()}`,
    { signal },
  );
  return results ?? [];
}

export function useResidentSearch(communityId: number) {
  return useCallback(
    (query: string, signal: AbortSignal) => searchResidents(communityId, query, signal),
    [communityId],
  );
}
