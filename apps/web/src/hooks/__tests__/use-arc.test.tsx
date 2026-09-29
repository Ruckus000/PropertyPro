/**
 * Characterization tests for `use-arc.ts` (TST-04 / roadmap 3.T4).
 *
 * Every existing test that touches the module `vi.mock`s it or imports only its
 * types, so the ARC write loop (#933 — create / review / decide / withdraw) had
 * never executed under test.
 *
 * What is pinned:
 * - the status/unit filters reach both the walked URL and the cache key, and an
 *   unfiltered list keys as `{}`;
 * - each mutation's endpoint, verb and body (communityId always in the body;
 *   the path carries the submission id, the body does not);
 * - every mutation invalidates the whole `['arc']` prefix — a decision moves a
 *   row between status filters, so every cached filter view must go stale —
 *   and nothing outside it.
 */
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import {
  ARC_KEYS,
  useArcSubmissions,
  useCreateArcSubmission,
  useDecideArcSubmission,
  useReviewArcSubmission,
  useWithdrawArcSubmission,
} from '../use-arc';

const CID = 6;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function page(items: unknown[]): Response {
  return json({ data: { data: items, pagination: { nextCursor: null, hasMore: false, pageSize: 100 } } });
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function wrap(qc: QueryClient) {
  return ({ children }: PropsWithChildren) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const UNIVERSE: Record<string, QueryKey> = {
  listAll: ARC_KEYS.list(CID),
  listSubmitted: ARC_KEYS.list(CID, { status: 'submitted' }),
  listApproved: ARC_KEYS.list(CID, { status: 'approved' }),
  detail: ARC_KEYS.detail(CID, 40),
  // Not an ARC key: must survive every ARC write.
  unrelatedViolations: ['violations', CID],
};

const ALL_ARC = ['detail', 'listAll', 'listApproved', 'listSubmitted'];

function seed(qc: QueryClient) {
  for (const key of Object.values(UNIVERSE)) qc.setQueryData(key, { seeded: true });
}

function invalidated(qc: QueryClient): string[] {
  return Object.entries(UNIVERSE)
    .filter(([, key]) => qc.getQueryState(key)?.isInvalidated === true)
    .map(([name]) => name)
    .sort();
}

function lastRequest() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit | undefined];
  return { url, method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined };
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('useArcSubmissions', () => {
  it('walks /api/v1/arc unfiltered and keys the list with an empty filter object', async () => {
    fetchMock.mockImplementation(async () => page([{ id: 40 }]));
    const qc = newClient();

    const { result } = renderHook(() => useArcSubmissions(CID), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/v1/arc?communityId=${CID}&pageSize=100`);
    expect(qc.getQueryData(['arc', 'list', CID, {}])).toEqual([{ id: 40 }]);
  });

  it('sends status and unitId filters and keys the cache by them', async () => {
    fetchMock.mockImplementation(async () => page([{ id: 41 }]));
    const qc = newClient();
    const filters = { status: 'under_review' as const, unitId: 102 };

    const { result } = renderHook(() => useArcSubmissions(CID, filters), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]![0]).toBe(
      `/api/v1/arc?communityId=${CID}&status=under_review&unitId=102&pageSize=100`,
    );
    expect(qc.getQueryData(['arc', 'list', CID, filters])).toEqual([{ id: 41 }]);
    expect(qc.getQueryData(['arc', 'list', CID, {}])).toBeUndefined();
  });

  it('is disabled for communityId 0', () => {
    renderHook(() => useArcSubmissions(0), { wrapper: wrap(newClient()) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ARC mutations', () => {
  const CASES = [
    {
      name: 'useCreateArcSubmission',
      useHook: () => useCreateArcSubmission(CID),
      vars: { unitId: 102, title: 'Fence', description: 'Six-foot privacy fence', projectType: 'fence' },
      url: '/api/v1/arc',
      method: 'POST',
      body: { communityId: CID, unitId: 102, title: 'Fence', description: 'Six-foot privacy fence', projectType: 'fence' },
    },
    {
      name: 'useReviewArcSubmission',
      useHook: () => useReviewArcSubmission(CID),
      vars: { id: 40, reviewNotes: 'Taking a look' },
      url: '/api/v1/arc/40/review',
      method: 'PATCH',
      body: { communityId: CID, reviewNotes: 'Taking a look' },
    },
    {
      name: 'useDecideArcSubmission',
      useHook: () => useDecideArcSubmission(CID),
      vars: { id: 40, decision: 'denied' as const, reviewNotes: 'Exceeds height limit' },
      url: '/api/v1/arc/40/decide',
      method: 'POST',
      body: { communityId: CID, decision: 'denied', reviewNotes: 'Exceeds height limit' },
    },
    {
      name: 'useWithdrawArcSubmission',
      useHook: () => useWithdrawArcSubmission(CID),
      vars: { id: 40 },
      url: '/api/v1/arc/40/withdraw',
      method: 'POST',
      body: { communityId: CID },
    },
  ];

  it.each(CASES)('$name sends the expected request and invalidates every ARC view', async (c) => {
    fetchMock.mockImplementation(async () => json({ data: { id: 40 } }));
    const qc = newClient();
    seed(qc);

    const { result } = renderHook(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      () => c.useHook() as { mutateAsync: (v: any) => Promise<unknown> },
      { wrapper: wrap(qc) },
    );
    await act(async () => {
      await result.current.mutateAsync(c.vars);
    });

    expect(lastRequest()).toEqual({ url: c.url, method: c.method, body: c.body });
    expect(invalidated(qc)).toEqual(ALL_ARC);
  });

  it('a refused decision surfaces the server message and invalidates nothing', async () => {
    fetchMock.mockImplementation(async () =>
      json({ error: { code: 'VALIDATION_ERROR', message: 'A denial must cite the rule violated' } }, 400),
    );
    const qc = newClient();
    seed(qc);

    const { result } = renderHook(() => useDecideArcSubmission(CID), { wrapper: wrap(qc) });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ id: 40, decision: 'denied' }),
      ).rejects.toThrow('A denial must cite the rule violated');
    });
    expect(invalidated(qc)).toEqual([]);
  });
});
