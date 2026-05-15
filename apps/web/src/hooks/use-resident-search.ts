'use client';

import { useCallback } from 'react';

export interface ResidentSearchResult {
  id: string;
  title: string;
  subtitle: string;
  unitNumber: string | null;
}

interface ResidentSearchResponse {
  results?: ResidentSearchResult[];
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

  // Search routes still return a flat `{ results }` payload, so this hook keeps
  // the response adapter local until the route-envelope migration reaches them.
  const res = await fetch(`/api/v1/search/residents?${params.toString()}`, { signal });
  if (!res.ok) throw new Error('Search failed');

  const json = (await res.json()) as ResidentSearchResponse;
  return json.results ?? [];
}

export function useResidentSearch(communityId: number) {
  return useCallback(
    (query: string, signal: AbortSignal) => searchResidents(communityId, query, signal),
    [communityId],
  );
}
