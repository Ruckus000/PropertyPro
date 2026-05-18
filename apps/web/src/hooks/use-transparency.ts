'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

export interface TransparencySettings {
  enabled: boolean;
  acknowledgedAt: string | null;
}

export interface UpdateTransparencySettingsInput {
  enabled: boolean;
  acknowledged: boolean;
}

export const TRANSPARENCY_SETTINGS_QUERY_KEY = (communityId: number) =>
  ['transparency-settings', communityId] as const;

export function useTransparencySettings(communityId: number) {
  return useQuery<TransparencySettings>({
    queryKey: TRANSPARENCY_SETTINGS_QUERY_KEY(communityId),
    enabled: communityId > 0,
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({ communityId: String(communityId) });
      return requestJson<TransparencySettings>(
        `/api/v1/transparency/settings?${params.toString()}`,
        { signal },
      );
    },
  });
}

export function useUpdateTransparencySettings(communityId: number) {
  const queryClient = useQueryClient();
  return useMutation<TransparencySettings, Error, UpdateTransparencySettingsInput>({
    // Documented exception to the requestJson rule: the component renders the
    // thrown message verbatim and relies on the exact fallback literal
    // 'Failed to save settings'. requestJson's fallback is 'Request failed',
    // which would silently change user-visible copy — raw fetch preserves it.
    mutationFn: async ({ enabled, acknowledged }) => {
      const response = await fetch('/api/v1/transparency/settings', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityId, enabled, acknowledged }),
      });

      const json = (await response.json()) as {
        data?: TransparencySettings;
        error?: { message?: string };
      };

      if (!response.ok || !json.data) {
        throw new Error(json.error?.message ?? 'Failed to save settings');
      }

      return json.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: TRANSPARENCY_SETTINGS_QUERY_KEY(communityId),
      });
    },
  });
}
