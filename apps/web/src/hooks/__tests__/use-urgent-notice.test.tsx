/**
 * Characterization tests for `use-urgent-notice.ts` (TST-04 / roadmap 3.T4).
 *
 * Both component tests that touch this module `vi.mock` it, so its cache
 * contract had never executed under test. That contract is unusual and easy to
 * "tidy" away: the mutations WRITE the server's record straight into the cache
 * (`setQueryData`) instead of invalidating, because a refetch would flash an
 * empty state on the one surface where that reads as "did it work?".
 *
 * What is pinned:
 * - the GET unwraps `{ data: { urgentNotice } }` down to the notice (or null);
 * - `initialData` from the server render (including an explicit `null`) is the
 *   first-render state, so the panel never shows a loading state;
 * - set writes the returned record into the cache, clear writes `null`, and
 *   neither triggers a refetch or touches another community's notice;
 * - a refused write leaves the cached notice untouched and surfaces the
 *   server-authored message (the panel shows it verbatim).
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import {
  urgentNoticeQueryKey,
  useClearUrgentNotice,
  useSetUrgentNotice,
  useUrgentNotice,
  type UrgentNotice,
} from '../use-urgent-notice';

const CID = 3;

const NOTICE: UrgentNotice = {
  text: 'Water shut off 9-11am',
  expiresAt: '2026-10-02T15:00:00.000Z',
  setAt: '2026-10-01T12:00:00.000Z',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrap(qc: QueryClient) {
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

function lastRequest() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined];
  return { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useUrgentNotice', () => {
  it('keys by community', () => {
    expect(urgentNoticeQueryKey(CID)).toEqual(['pm', 'site', 'urgent-notice', CID]);
  });

  it('fetches the notice with communityId and unwraps it out of { urgentNotice }', async () => {
    fetchMock.mockImplementation(async () => json({ data: { urgentNotice: NOTICE } }));
    const qc = newClient();

    const { result } = renderHook(() => useUrgentNotice(CID), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/v1/pm/site/urgent-notice?communityId=${CID}`);
    expect(result.current.data).toEqual(NOTICE);
  });

  it('resolves to null when there is no notice', async () => {
    fetchMock.mockImplementation(async () => json({ data: { urgentNotice: null } }));
    const { result } = renderHook(() => useUrgentNotice(CID), { wrapper: wrap(newClient()) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it('paints server-rendered initialData immediately, including an explicit null', () => {
    fetchMock.mockImplementation(async () => json({ data: { urgentNotice: NOTICE } }));

    const seeded = renderHook(() => useUrgentNotice(CID, NOTICE), { wrapper: wrap(newClient()) });
    expect(seeded.result.current.data).toEqual(NOTICE);
    expect(seeded.result.current.isSuccess).toBe(true);

    const empty = renderHook(() => useUrgentNotice(CID, null), { wrapper: wrap(newClient()) });
    expect(empty.result.current.data).toBeNull();
    expect(empty.result.current.isSuccess).toBe(true);
  });
});

describe('useSetUrgentNotice', () => {
  it('POSTs { communityId, text, expiresAt } and writes the returned record into the cache without refetching', async () => {
    const saved = { ...NOTICE, setAt: '2026-10-01T13:00:00.000Z' };
    fetchMock.mockImplementation(async () => json({ data: { urgentNotice: saved } }));
    const qc = newClient();
    qc.setQueryData(urgentNoticeQueryKey(CID), null);
    qc.setQueryData(urgentNoticeQueryKey(CID + 1), NOTICE);

    const { result } = renderHook(() => useSetUrgentNotice(CID), { wrapper: wrap(qc) });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync({ text: NOTICE.text, expiresAt: NOTICE.expiresAt });
    });

    expect(out).toEqual(saved);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastRequest()).toEqual({
      url: '/api/v1/pm/site/urgent-notice',
      method: 'POST',
      body: { communityId: CID, text: NOTICE.text, expiresAt: NOTICE.expiresAt },
    });
    expect(qc.getQueryData(urgentNoticeQueryKey(CID))).toEqual(saved);
    // Written, not invalidated: nothing is marked stale for a refetch.
    expect(qc.getQueryState(urgentNoticeQueryKey(CID))?.isInvalidated).toBe(false);
    expect(qc.getQueryData(urgentNoticeQueryKey(CID + 1))).toEqual(NOTICE);
  });

  it('a refused set surfaces the server message and leaves the cached notice alone', async () => {
    fetchMock.mockImplementation(async () =>
      json({ error: { code: 'CONFLICT', message: 'Publish your website first' } }, 409),
    );
    const qc = newClient();
    qc.setQueryData(urgentNoticeQueryKey(CID), NOTICE);

    const { result } = renderHook(() => useSetUrgentNotice(CID), { wrapper: wrap(qc) });
    await act(async () => {
      await expect(result.current.mutateAsync({ text: 'x', expiresAt: null })).rejects.toThrow(
        'Publish your website first',
      );
    });
    expect(qc.getQueryData(urgentNoticeQueryKey(CID))).toEqual(NOTICE);
  });
});

describe('useClearUrgentNotice', () => {
  it('DELETEs with communityId in the query and writes null into the cache', async () => {
    fetchMock.mockImplementation(async () => json({ data: { ok: true } }));
    const qc = newClient();
    qc.setQueryData(urgentNoticeQueryKey(CID), NOTICE);
    qc.setQueryData(urgentNoticeQueryKey(CID + 1), NOTICE);

    const { result } = renderHook(() => useClearUrgentNotice(CID), { wrapper: wrap(qc) });
    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(lastRequest()).toEqual({
      url: `/api/v1/pm/site/urgent-notice?communityId=${CID}`,
      method: 'DELETE',
      body: undefined,
    });
    expect(qc.getQueryData(urgentNoticeQueryKey(CID))).toBeNull();
    expect(qc.getQueryState(urgentNoticeQueryKey(CID))?.isInvalidated).toBe(false);
    expect(qc.getQueryData(urgentNoticeQueryKey(CID + 1))).toEqual(NOTICE);
  });
});
