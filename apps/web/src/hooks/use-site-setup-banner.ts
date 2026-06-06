'use client';

/**
 * Hooks for the PM dashboard "finish your site" banner dismissal, backed by
 * GET/POST /api/v1/pm/site-setup-banner (user_preferences). Canonical
 * { data: T } envelope.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestJson } from '@/lib/api/request-json';

const bannerKey = ['pm', 'site-setup-banner'] as const;

export function useSiteSetupBannerDismissed() {
  return useQuery<boolean>({
    queryKey: bannerKey,
    queryFn: async ({ signal }) => {
      const { dismissed } = await requestJson<{ dismissed: boolean }>(
        '/api/v1/pm/site-setup-banner',
        { signal },
      );
      return dismissed;
    },
  });
}

export function useDismissSiteSetupBanner() {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await requestJson<{ dismissed: true }>('/api/v1/pm/site-setup-banner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
    },
    // Optimistically mark dismissed so the banner disappears immediately.
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: bannerKey });
      const previous = qc.getQueryData<boolean>(bannerKey);
      qc.setQueryData<boolean>(bannerKey, true);
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx && typeof (ctx as { previous?: boolean }).previous === 'boolean') {
        qc.setQueryData<boolean>(bannerKey, (ctx as { previous: boolean }).previous);
      }
    },
  });
}
