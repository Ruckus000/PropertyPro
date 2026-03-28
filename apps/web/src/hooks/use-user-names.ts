'use client';

import { useQuery } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

function getFallbackUserDisplayName(userId: string): string {
  return `User ${userId.slice(0, 8)}`;
}

export function useUserNames(communityId: number, userIds: string[]): {
  getName: (userId: string) => string;
  isLoading: boolean;
} {
  const normalizedUserIds = Array.from(
    new Set(userIds.filter((userId) => typeof userId === 'string' && userId.length > 0)),
  ).sort();

  const query = useQuery({
    queryKey: ['user-names', communityId, ...normalizedUserIds],
    queryFn: async () => {
      const searchParams = new URLSearchParams({
        communityId: String(communityId),
        ids: normalizedUserIds.join(','),
      });

      return requestJson<Record<string, string>>(
        `/api/v1/users/names?${searchParams.toString()}`,
      );
    },
    enabled: communityId > 0 && normalizedUserIds.length > 0,
    staleTime: 300_000,
  });

  return {
    getName: (userId: string) =>
      query.data?.[userId] ?? getFallbackUserDisplayName(userId),
    isLoading: query.isLoading,
  };
}
