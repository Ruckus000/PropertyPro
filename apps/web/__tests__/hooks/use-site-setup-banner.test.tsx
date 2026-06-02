import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';
import {
  useSiteSetupBannerDismissed,
  useDismissSiteSetupBanner,
} from '@/hooks/use-site-setup-banner';

function makeWrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })) {
  return {
    client,
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
}

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('useSiteSetupBannerDismissed', () => {
  it('GETs the banner status and returns the dismissed flag', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { dismissed: true } }),
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSiteSetupBannerDismissed(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith('/api/v1/pm/site-setup-banner', expect.anything());
  });
});

describe('useDismissSiteSetupBanner', () => {
  it('POSTs to dismiss and optimistically sets the cache to dismissed', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { dismissed: true } }),
    });
    const { client, wrapper } = makeWrapper();
    client.setQueryData(['pm', 'site-setup-banner'], false);

    const { result } = renderHook(() => useDismissSiteSetupBanner(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(global.fetch).toHaveBeenCalledWith(
      '/api/v1/pm/site-setup-banner',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(client.getQueryData(['pm', 'site-setup-banner'])).toBe(true);
  });

  it('rolls back the optimistic dismissal on error', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ ok: false, status: 500 });
    const { client, wrapper } = makeWrapper();
    client.setQueryData(['pm', 'site-setup-banner'], false);

    const { result } = renderHook(() => useDismissSiteSetupBanner(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync()).rejects.toThrow();
    });
    expect(client.getQueryData(['pm', 'site-setup-banner'])).toBe(false);
  });
});
