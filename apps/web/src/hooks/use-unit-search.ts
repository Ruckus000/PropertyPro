'use client';

import { useCallback } from 'react';
import { requestJson } from '@/lib/api/request-json';

export interface UnitSearchResult {
  id: number;
  label: string;
  building: string | null;
  floor: number | null;
}

export const UNIT_SEARCH_FETCH_LIMIT = 10;

export function meetsUnitSearchMinLength(q: string): boolean {
  return q.trim().length >= 1;
}

async function searchUnits(
  communityId: number,
  query: string,
  signal: AbortSignal,
): Promise<UnitSearchResult[]> {
  if (!meetsUnitSearchMinLength(query)) {
    return [];
  }

  const params = new URLSearchParams({
    communityId: String(communityId),
    q: query.trim(),
    limit: String(UNIT_SEARCH_FETCH_LIMIT),
  });

  const { results } = await requestJson<{ results?: UnitSearchResult[] }>(
    `/api/v1/search/units?${params.toString()}`,
    { signal },
  );
  return results ?? [];
}

export function useUnitSearch(communityId: number) {
  return useCallback(
    (query: string, signal: AbortSignal) => searchUnits(communityId, query, signal),
    [communityId],
  );
}
