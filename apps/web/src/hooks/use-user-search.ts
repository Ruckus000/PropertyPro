'use client';

import { useCallback } from 'react';

export interface UserSearchResult {
  id: string;
  title: string;
  subtitle?: string;
}

interface UserSearchResponse {
  results?: UserSearchResult[];
}

export const USER_SEARCH_FETCH_LIMIT = 10;

export function meetsUserSearchMinLength(q: string): boolean {
  const trimmed = q.trim();
  if (!trimmed) return false;
  if (/^\d/.test(trimmed)) return trimmed.length >= 1;
  return trimmed.length >= 2;
}

async function searchUsers(
  communityId: number,
  query: string,
  signal: AbortSignal,
): Promise<UserSearchResult[]> {
  if (!meetsUserSearchMinLength(query)) {
    return [];
  }

  const params = new URLSearchParams({
    communityId: String(communityId),
    q: query.trim(),
    limit: String(USER_SEARCH_FETCH_LIMIT),
  });

  // Search routes still return a flat `{ results }` payload, so this hook keeps
  // the response adapter local until the route-envelope migration reaches them.
  const res = await fetch(`/api/v1/search/users?${params.toString()}`, { signal });
  if (!res.ok) throw new Error('Search failed');

  const json = (await res.json()) as UserSearchResponse;
  return json.results ?? [];
}

export function useUserSearch(communityId: number) {
  return useCallback(
    (query: string, signal: AbortSignal) => searchUsers(communityId, query, signal),
    [communityId],
  );
}
