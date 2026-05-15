'use client';

import { useQuery } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';
import type { OverviewPayload } from '@/lib/queries/cross-community.types';

export const OVERVIEW_QUERY_KEY = ['overview'] as const;

export function useOverview() {
  return useQuery<OverviewPayload>({
    queryKey: OVERVIEW_QUERY_KEY,
    queryFn: () => requestJson<OverviewPayload>('/api/v1/overview'),
    staleTime: 30_000,
  });
}
