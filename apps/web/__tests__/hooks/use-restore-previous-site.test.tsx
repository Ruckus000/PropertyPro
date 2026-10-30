/**
 * `useRestorePreviousSite` — the website home's Restore (spec corrections 3
 * and 4).
 *
 * The network is a small FAKE SERVER on `fetch`, routed by method and path. It
 * records each call in order and keeps the state Restore must not damage:
 *
 * - `live`: the publish token of the live site;
 * - `drafts`: what is staged — the person's own edits, a page staged for
 *   removal, or a reverted version. Discard empties it, revert replaces the
 *   sections with the snapshot, publish puts it live.
 *
 * The hook and `usePublishSite` are real.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import {
  RESTORE_NOT_CHANGED_MESSAGE,
  RESTORE_STALE_MESSAGE,
  useRestorePreviousSite,
} from '@/hooks/use-restore-previous-site';

const COMMUNITY_ID = 42;
const PAGE_TOKEN = '2026-10-20T15:00:00.000Z';

interface Call {
  method: string;
  path: string;
  body: Record<string, unknown> | null;
}

let calls: Call[];
let live: string;
let drafts: string[];
/** What the public site shows: its sections and pages. */
let site: string[];
let publishStatus: number;
let revertStatus: number;

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

beforeEach(() => {
  calls = [];
  live = PAGE_TOKEN;
  // The person's unpublished work: an edit, and the About page staged for removal.
  drafts = ['edit:welcome', 'remove-page:about'];
  site = ['version:30', 'page:about'];
  publishStatus = 200;
  revertStatus = 200;
  global.fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input, 'https://app.example.com');
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null;
    calls.push({ method, path: url.pathname, body });
    switch (`${method} ${url.pathname}`) {
      case 'GET /api/v1/pm/site/blocks':
        return respond(200, { data: { blocks: [], publishedBlocks: [], latestPublishedAt: live } });
      case 'DELETE /api/v1/pm/site/drafts':
        drafts = [];
        return respond(200, { data: { ok: true, discardedCount: 2 } });
      case 'POST /api/v1/pm/site/publish/revert':
        if (revertStatus !== 200) return respond(revertStatus, { error: { message: 'Snapshot payload is gone.' } });
        // A revert rewrites draft SECTIONS only; staged page changes stay staged.
        drafts = [...drafts.filter((d) => !d.startsWith('edit:')), `version:${String(body?.['snapshotId'])}`];
        return respond(200, { data: { ok: true } });
      case 'POST /api/v1/pm/site/publish':
        // The publish route's optimistic-concurrency check.
        if (publishStatus !== 200 || body?.['expectedPublishedAt'] !== live) {
          return respond(publishStatus, { error: { code: 'CONFLICT', message: 'Someone else published.' } });
        }
        for (const draft of drafts) {
          if (draft.startsWith('version:')) site = [draft, ...site.filter((s) => !s.startsWith('version:'))];
          if (draft.startsWith('remove-page:')) site = site.filter((s) => s !== `page:${draft.slice(12)}`);
        }
        drafts = [];
        live = '2026-10-29T12:00:00.000Z';
        return respond(200, { data: { published: true, publishedAt: live, promotedCount: 3, retiredCount: 0 } });
      default:
        return respond(404, { error: { message: `no route for ${method} ${url.pathname}` } });
    }
  }) as unknown as typeof fetch;
});

function renderRestore(options = { publishToken: PAGE_TOKEN as string | null, previousSnapshotId: 29 as number | null }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useRestorePreviousSite(COMMUNITY_ID, options), { wrapper }).result;
}

const writes = () => calls.filter((call) => call.method !== 'GET').map((call) => `${call.method} ${call.path}`);

describe('useRestorePreviousSite', () => {
  it('restore reverts to the second-newest snapshot, then publishes', async () => {
    const result = renderRestore();

    await act(() => result.current.restoreLatest());

    // The order is discard -> revert -> publish, after the live check.
    expect(calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'GET /api/v1/pm/site/blocks',
      'DELETE /api/v1/pm/site/drafts',
      'POST /api/v1/pm/site/publish/revert',
      'POST /api/v1/pm/site/publish',
    ]);
    // The version named at page load, published under the page-load token.
    expect(calls[2]!.body).toEqual({ communityId: COMMUNITY_ID, snapshotId: 29 });
    expect(calls[3]!.body).toEqual({ communityId: COMMUNITY_ID, expectedPublishedAt: PAGE_TOKEN });
    expect(site).toContain('version:29');
  });

  it('a page staged for removal does not go live with the restore', async () => {
    const result = renderRestore();

    await act(() => result.current.restoreLatest());

    expect(site).toEqual(['version:29', 'page:about']);
  });

  it('refuses with no writes when the live site has changed since the page loaded', async () => {
    live = '2026-10-28T09:00:00.000Z'; // a colleague published
    const result = renderRestore();

    await expect(result.current.restoreLatest()).rejects.toMatchObject({ kind: 'stale', message: RESTORE_STALE_MESSAGE });
    expect(writes()).toEqual([]);
    expect(drafts).toEqual(['edit:welcome', 'remove-page:about']);
  });

  it('a publish refused after the revert clears the staged version: the site is unchanged', async () => {
    publishStatus = 409;
    const result = renderRestore();

    await expect(result.current.restoreLatest()).rejects.toMatchObject({
      kind: 'not_changed',
      message: RESTORE_NOT_CHANGED_MESSAGE,
    });
    expect(writes()).toEqual([
      'DELETE /api/v1/pm/site/drafts',
      'POST /api/v1/pm/site/publish/revert',
      'POST /api/v1/pm/site/publish',
      'DELETE /api/v1/pm/site/drafts',
    ]);
    // Nothing is left staged for someone else's next Publish, and the live site is as it was.
    expect(drafts).toEqual([]);
    expect(site).toEqual(['version:30', 'page:about']);
  });

  it('a failed revert is cleaned up the same way', async () => {
    revertStatus = 400;
    const result = renderRestore();

    await expect(result.current.restoreLatest()).rejects.toMatchObject({ kind: 'not_changed' });
    expect(writes()).toEqual([
      'DELETE /api/v1/pm/site/drafts',
      'POST /api/v1/pm/site/publish/revert',
      'DELETE /api/v1/pm/site/drafts',
    ]);
  });

  it('restores a chosen version from the list the same way', async () => {
    const result = renderRestore();

    await act(() => result.current.restoreSnapshot(28));

    expect(writes()).toEqual([
      'DELETE /api/v1/pm/site/drafts',
      'POST /api/v1/pm/site/publish/revert',
      'POST /api/v1/pm/site/publish',
    ]);
    expect(calls.find((call) => call.path.endsWith('/revert'))!.body).toEqual({ communityId: COMMUNITY_ID, snapshotId: 28 });
  });

  it('writes nothing when there is no earlier version', async () => {
    const result = renderRestore({ publishToken: PAGE_TOKEN, previousSnapshotId: null });

    await expect(result.current.restoreLatest()).rejects.toThrow(
      "There's no earlier version of your site to go back to.",
    );
    expect(calls).toEqual([]);
  });
});
