'use client';

/**
 * Hooks for the PM dashboard "finish your site" banner dismissal, backed by
 * GET/POST /api/v1/pm/site-setup-banner (user_preferences). Canonical
 * { data: T } envelope.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const bannerKey = ['pm', 'site-setup-banner'] as const;

export function useSiteSetupBannerDismissed() {
  return useQuery<boolean>({
    queryKey: bannerKey,
    queryFn: async ({ signal }) => {
      const res = await fetch('/api/v1/pm/site-setup-banner', { signal });
      if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`);
      const body = (await res.json()) as { data: { dismissed: boolean } };
      return body.data.dismissed;
    },
  });
}

export function useDismissSiteSetupBanner() {
  const qc = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      const res = await fetch('/api/v1/pm/site-setup-banner', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      if (!res.ok) throw new Error(`Request failed (HTTP ${res.status})`);
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
