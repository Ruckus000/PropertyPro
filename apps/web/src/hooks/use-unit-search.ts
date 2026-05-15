'use client';

import { useCallback } from 'react';

export interface UnitSearchResult {
  id: number;
  label: string;
  building: string | null;
  floor: number | null;
}

interface UnitSearchResponse {
  results?: UnitSearchResult[];
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

  // Search routes still return a flat `{ results }` payload, so this hook keeps
  // the response adapter local until the route-envelope migration reaches them.
  const res = await fetch(`/api/v1/search/units?${params.toString()}`, { signal });
  if (!res.ok) throw new Error('Search failed');

  const json = (await res.json()) as UnitSearchResponse;
  return json.results ?? [];
}

export function useUnitSearch(communityId: number) {
  return useCallback(
    (query: string, signal: AbortSignal) => searchUnits(communityId, query, signal),
    [communityId],
  );
}
