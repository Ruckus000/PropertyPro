'use client';

import { useQuery } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export const USER_COMMUNITY_COUNT_QUERY_KEY = ['user-community-count'] as const;

/**
 * Lazy lookup of how many communities the authenticated user belongs to.
 *
 * Backs ProfileMenu's "Switch Community" affordance. The query stays disabled
 * until the menu opens (`enabled`), and `staleTime: Infinity` keeps it from
 * refetching on subsequent opens within the component's lifetime — matching
 * the previous fetch-once-on-open behavior.
 */
export function useUserCommunityCount(enabled: boolean) {
  return useQuery({
    queryKey: USER_COMMUNITY_COUNT_QUERY_KEY,
    queryFn: ({ signal }) =>
      requestJson<{ count: number }>('/api/v1/user/communities', { signal }),
    select: (payload) => payload.count,
    enabled,
    staleTime: Infinity,
  });
}
