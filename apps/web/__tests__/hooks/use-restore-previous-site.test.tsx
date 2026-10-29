/**
 * `useRestorePreviousSite` — the website home's Restore (spec corrections 3
 * and 4): revert to an earlier publish, then publish it with the token read
 * before the revert.
 *
 * The network is a small fake server on `fetch`, routed by method and path,
 * that records each call in order. The hook and `usePublishSite` are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useRestorePreviousSite } from '@/hooks/use-restore-previous-site';
import { PublishConflictError } from '@/hooks/use-publish-site';

const COMMUNITY_ID = 42;
const TOKEN = '2026-10-20T15:00:00.000Z';

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

let calls: Call[];
let history: Array<{ id: number; restorable: boolean }>;
let publishStatus: number;

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  calls = [];
  // Newest first: 30 is the live version, 29 is how the site was before it.
  history = [
    { id: 30, restorable: true },
    { id: 29, restorable: true },
  ];
  publishStatus = 200;
  global.fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'https://app.example.com');
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      path: `${url.pathname}${url.search}`,
      body: typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    });
    if (url.pathname === '/api/v1/pm/site/publish/history') {
      const pageSize = Number(url.searchParams.get('pageSize') ?? 50);
      return respond(200, {
        data: { data: history.slice(0, pageSize), pagination: { nextCursor: null, hasMore: false, pageSize } },
      });
    }
    if (url.pathname === '/api/v1/pm/site/blocks') {
      return respond(200, { data: { blocks: [], publishedBlocks: [], latestPublishedAt: TOKEN } });
    }
    if (url.pathname === '/api/v1/pm/site/publish/revert') {
      return respond(200, { data: { ok: true, snapshotId: 29 } });
    }
    if (url.pathname === '/api/v1/pm/site/publish') {
      return publishStatus === 409
        ? respond(409, { error: { code: 'CONFLICT', message: 'Someone else published the site. Reload and try again.' } })
        : respond(200, { data: { published: true, publishedAt: '2026-10-29T12:00:00.000Z', promotedCount: 3, retiredCount: 0 } });
    }
    return respond(404, { error: { message: `no route for ${url.pathname}` } });
  }) as unknown as typeof fetch;
});

function renderRestore() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useRestorePreviousSite(COMMUNITY_ID), { wrapper }).result;
}

describe('useRestorePreviousSite', () => {
  it('restore reverts to the second-newest snapshot, then publishes', async () => {
    const result = renderRestore();

    await act(() => result.current.restoreLatest());

    const writes = calls.filter((call) => call.method === 'POST');
    expect(writes).toEqual([
      // The version before the last publish, not the live one.
      { method: 'POST', path: '/api/v1/pm/site/publish/revert', body: { communityId: COMMUNITY_ID, snapshotId: 29 } },
      // Then live, guarded by the token read before the revert.
      { method: 'POST', path: '/api/v1/pm/site/publish', body: { communityId: COMMUNITY_ID, expectedPublishedAt: TOKEN } },
    ]);
    const tokenRead = calls.findIndex((call) => call.path.startsWith('/api/v1/pm/site/blocks'));
    const revert = calls.findIndex((call) => call.path === '/api/v1/pm/site/publish/revert');
    expect(tokenRead).toBeGreaterThanOrEqual(0);
    expect(tokenRead).toBeLessThan(revert);
  });

  it('restores a chosen version from the list the same way', async () => {
    history = [{ id: 30, restorable: true }, { id: 29, restorable: true }, { id: 28, restorable: true }];
    const result = renderRestore();

    await act(() => result.current.restoreSnapshot(28));

    expect(calls.filter((call) => call.method === 'POST').map((call) => call.body)).toEqual([
      { communityId: COMMUNITY_ID, snapshotId: 28 },
      { communityId: COMMUNITY_ID, expectedPublishedAt: TOKEN },
    ]);
  });

  it('writes nothing when there is no earlier version, or it can no longer be restored', async () => {
    history = [{ id: 30, restorable: true }];
    const result = renderRestore();
    await expect(result.current.restoreLatest()).rejects.toThrow(
      "There's no earlier version of your site to go back to.",
    );

    history = [{ id: 30, restorable: true }, { id: 29, restorable: false }];
    await expect(result.current.restoreLatest()).rejects.toThrow(
      'The version before your last publish is too old to restore.',
    );
    expect(calls.filter((call) => call.method === 'POST')).toEqual([]);
  });

  it('a site published elsewhere in the meantime is refused, not overwritten', async () => {
    publishStatus = 409;
    const result = renderRestore();

    await expect(result.current.restoreLatest()).rejects.toBeInstanceOf(PublishConflictError);
  });
});
