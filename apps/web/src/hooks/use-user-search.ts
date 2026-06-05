'use client';

import { useCallback } from 'react';
import { requestJson } from '@/lib/api/request-json';

export interface UserSearchResult {
  id: string;
  title: string;
  subtitle?: string;
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

  const { results } = await requestJson<{ results?: UserSearchResult[] }>(
    `/api/v1/search/users?${params.toString()}`,
    { signal },
  );
  return results ?? [];
}

export function useUserSearch(communityId: number) {
  return useCallback(
    (query: string, signal: AbortSignal) => searchUsers(communityId, query, signal),
    [communityId],
  );
}
