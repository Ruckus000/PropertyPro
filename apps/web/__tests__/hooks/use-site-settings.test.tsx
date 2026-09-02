/**
 * useSiteSettings hooks — what the query cache holds after a mutation.
 *
 * Two cache behaviours the storage meter depends on, neither visible from the
 * panel's tests (which mock this module):
 *
 *   1. a settings save replaces the cached record with the PATCH response —
 *      which is WHY the server has to put `storage` on that response, not on
 *      GET alone;
 *   2. a favicon upload charges the quota server-side, so after mirroring the
 *      favicon locally the hook must invalidate the record — with the
 *      provider's 60 s staleTime nothing else would refetch it, and the meter
 *      would sit on the pre-upload number.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import React from 'react';

const { requestJsonMock } = vi.hoisted(() => ({
  requestJsonMock: vi.fn(),
}));

vi.mock('@/lib/api/request-json', () => ({
  requestJson: requestJsonMock,
}));

import {
  siteSettingsQueryKey,
  useUpdateSiteSettings,
  useUploadFavicon,
  type SiteSettingsRecord,
} from '@/hooks/use-site-settings';

const COMMUNITY_ID = 42;

const RECORD: SiteSettingsRecord = {
  settings: { seoTitle: null, seoDescription: null, searchIndexing: true, favicon: null },
  footer: { associationName: null, note: null, showStatutoryLine: false },
  storage: { assetsBytesUsed: 1024, quotaBytes: 500 * 1024 * 1024 },
};

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { Wrapper, client };
}

const originalFetch = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('useUpdateSiteSettings', () => {
  it('replaces the cached record with the PATCH response, storage included', async () => {
    const { Wrapper, client } = makeWrapper();
    const key = siteSettingsQueryKey(COMMUNITY_ID);
    client.setQueryData(key, RECORD);

    const saved: SiteSettingsRecord = {
      ...RECORD,
      settings: { ...RECORD.settings, seoTitle: 'Sunset Living' },
      storage: { assetsBytesUsed: 4096, quotaBytes: RECORD.storage.quotaBytes },
    };
    requestJsonMock.mockResolvedValueOnce(saved);

    const { result } = renderHook(() => useUpdateSiteSettings(COMMUNITY_ID), {
      wrapper: Wrapper,
    });
    result.current.mutate({ seoTitle: 'Sunset Living' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    // Whatever the PATCH returned IS the record now — so a GET-only field
    // would have vanished here.
    expect(client.getQueryData(key)).toEqual(saved);
    expect(requestJsonMock).toHaveBeenCalledWith(
      '/api/v1/pm/site/settings',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });
});

describe('useUploadFavicon', () => {
  const finalized = {
    icon32Path: '42/favicon/uuid.32.png',
    appleTouch180Path: '42/favicon/uuid.180.png',
  };

  beforeEach(() => {
    requestJsonMock
      .mockResolvedValueOnce({
        uploadUrl: 'https://storage.example/presigned',
        token: 't',
        storagePath: '42/favicon/uuid.png',
        expiresAt: '2026-09-02T00:00:00Z',
      })
      .mockResolvedValueOnce(finalized);
    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  it('mirrors the new favicon at once AND invalidates the record so storage refetches', async () => {
    const { Wrapper, client } = makeWrapper();
    const key = siteSettingsQueryKey(COMMUNITY_ID);
    client.setQueryData(key, RECORD);

    const { result } = renderHook(() => useUploadFavicon(COMMUNITY_ID), { wrapper: Wrapper });
    result.current.mutate(new File(['png'], 'icon.png', { type: 'image/png' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const cached = client.getQueryData<SiteSettingsRecord>(key);
    // The favicon shows immediately, without a round trip...
    expect(cached?.settings.favicon).toEqual(finalized);
    // ...the rest of the record is untouched locally...
    expect(cached?.storage).toEqual(RECORD.storage);
    // ...and the record is marked stale, so the next observer refetches the
    // usage that finalize just charged. Without an active observer the
    // invalidation is the observable, not the refetch itself.
    expect(client.getQueryState(key)?.isInvalidated).toBe(true);
  });
});
