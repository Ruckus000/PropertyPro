'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export type SnowbirdCadence = 'weekly' | 'monthly' | 'off';

export interface SnowbirdSubscription {
  cadence: SnowbirdCadence;
  communityEnabled: boolean;
}

export const snowbirdDigestKey = (communityId: number) => ['snowbird-digest', communityId] as const;

export function useSnowbirdDigest(communityId: number) {
  return useQuery<SnowbirdSubscription>({
    queryKey: snowbirdDigestKey(communityId),
    queryFn: () =>
      requestJson<SnowbirdSubscription>(`/api/v1/snowbird-digest/subscription?communityId=${communityId}`),
    enabled: communityId > 0,
  });
}

export function useSetSnowbirdCadence(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cadence: SnowbirdCadence) =>
      requestJson<{ cadence: SnowbirdCadence }>('/api/v1/snowbird-digest/subscription', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, cadence }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: snowbirdDigestKey(communityId) });
    },
  });
}

export function useSetSnowbirdCommunityEnabled(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) =>
      requestJson<{ enabled: boolean }>('/api/v1/snowbird-digest/community', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ communityId, enabled }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: snowbirdDigestKey(communityId) });
    },
  });
}
