/**
 * Characterization tests for `use-meetings.ts` (TST-04 / roadmap 3.T4).
 *
 * Before this file every test touching the module either `vi.mock`ed it or
 * imported only its types, so none of its 7 hooks executed under test.
 *
 * What is pinned:
 * - the `start`/`end` window reaches both the URL and the cache key (a key that
 *   ignored the window would serve one month's meetings for another);
 * - the create/update mutations keep the `warnings` sibling (#932 — the
 *   statutory notice-window advisory) instead of dropping it via `requestJson`;
 * - the three action-multiplexed POSTs send the right `action` discriminator;
 * - every write invalidates the whole `['meetings']` prefix — list, detail and
 *   calendar views — and nothing outside it.
 *
 * Network is stubbed at `fetch`; `requestJson`/`requestJsonEnvelope` run for real.
 */
import { QueryClient, QueryClientProvider, type QueryKey } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

import {
  MEETING_KEYS,
  useCalendarEvents,
  useCreateMeeting,
  useDeleteMeeting,
  useMeeting,
  useMeetings,
  usePostMeetingNotice,
  useUpdateMeeting,
} from '../use-meetings';

const CID = 4;

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

const UNIVERSE: Record<string, QueryKey> = {
  list: MEETING_KEYS.list(CID),
  listWindow: MEETING_KEYS.list(CID, '2026-10-01', '2026-10-31'),
  detail: MEETING_KEYS.detail(CID, 12),
  calendar: MEETING_KEYS.calendarEvents(CID, '2026-10-01', '2026-10-31'),
  otherCommunityList: MEETING_KEYS.list(CID + 1),
  // Not a meetings key: must never be touched by a meetings write.
  unrelatedDocuments: ['documents', CID, 'all'],
};

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

describe('useMeetings', () => {
  it('omits start/end when no window is given and keys the list as "all"', async () => {
    fetchMock.mockImplementation(async () => json({ data: [{ id: 1 }] }));
    const qc = newClient();

    const { result } = renderHook(() => useMeetings(CID), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/v1/meetings?communityId=${CID}`);
    expect(qc.getQueryData(['meetings', 'list', CID, 'all', 'all'])).toEqual([{ id: 1 }]);
  });

  it('sends the start/end window and keys the cache by it', async () => {
    fetchMock.mockImplementation(async () => json({ data: [{ id: 2 }] }));
    const qc = newClient();

    const { result } = renderHook(
      () => useMeetings(CID, { start: '2026-10-01', end: '2026-10-31' }),
      { wrapper: wrap(qc) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]![0]).toBe(
      `/api/v1/meetings?communityId=${CID}&start=2026-10-01&end=2026-10-31`,
    );
    expect(qc.getQueryData(['meetings', 'list', CID, '2026-10-01', '2026-10-31'])).toEqual([{ id: 2 }]);
    // The un-windowed slot must not have been filled by the windowed fetch.
    expect(qc.getQueryData(['meetings', 'list', CID, 'all', 'all'])).toBeUndefined();
  });

  it('is disabled for communityId 0', () => {
    renderHook(() => useMeetings(0), { wrapper: wrap(newClient()) });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('useMeeting', () => {
  it('fetches the detail URL and caches under the detail key', async () => {
    fetchMock.mockImplementation(async () => json({ data: { id: 12, documents: [] } }));
    const qc = newClient();

    const { result } = renderHook(() => useMeeting(CID, 12), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]![0]).toBe(`/api/v1/meetings/12?communityId=${CID}`);
    expect(qc.getQueryData(['meetings', 'detail', CID, 12])).toEqual({ id: 12, documents: [] });
  });

  it('is disabled for a null id and parks under the "none" sentinel', () => {
    const qc = newClient();
    renderHook(() => useMeeting(CID, null), { wrapper: wrap(qc) });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(qc.getQueryCache().find({ queryKey: ['meetings', 'detail', CID, 'none'], exact: true })).toBeDefined();
  });
});

describe('useCalendarEvents', () => {
  it('URL-encodes the window and keys by it', async () => {
    fetchMock.mockImplementation(async () => json({ data: [] }));
    const qc = newClient();
    const start = '2026-10-01T00:00:00.000Z';
    const end = '2026-10-31T23:59:59.999Z';

    const { result } = renderHook(() => useCalendarEvents(CID, start, end), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock.mock.calls[0]![0]).toBe(
      `/api/v1/calendar/events?communityId=${CID}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
    );
    expect(qc.getQueryData(['meetings', 'calendar', CID, start, end])).toEqual([]);
  });

  it('is disabled while either bound is empty', () => {
    renderHook(
      () => {
        useCalendarEvents(CID, '', '2026-10-31');
        useCalendarEvents(CID, '2026-10-01', '');
      },
      { wrapper: wrap(newClient()) },
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('meeting mutations', () => {
  const payload = {
    title: 'Budget',
    meetingType: 'owner',
    startsAt: '2026-10-20T18:00:00.000Z',
    location: 'Clubhouse',
  };

  it('useCreateMeeting returns { data, warnings } — the notice-window warning survives', async () => {
    const warning = { code: 'notice_window_missed', message: 'Owner meetings need 14 days notice' };
    fetchMock.mockImplementation(async () => json({ data: { id: 30, title: 'Budget' }, warnings: [warning] }));
    const qc = newClient();
    seed(qc);

    const { result } = renderHook(() => useCreateMeeting(CID), { wrapper: wrap(qc) });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync(payload);
    });

    expect(out).toEqual({ data: { id: 30, title: 'Budget' }, warnings: [warning] });
    expect(lastRequest()).toEqual({
      url: '/api/v1/meetings',
      method: 'POST',
      body: { communityId: CID, ...payload },
    });
    expect(invalidated(qc)).toEqual(['calendar', 'detail', 'list', 'listWindow', 'otherCommunityList']);
  });

  it('useUpdateMeeting sends action "update" and also keeps warnings', async () => {
    const warning = { code: 'notice_window_missed', message: 'Board meetings need 48 hours notice' };
    fetchMock.mockImplementation(async () => json({ data: { id: 12 }, warnings: [warning] }));
    const qc = newClient();
    seed(qc);

    const { result } = renderHook(() => useUpdateMeeting(CID), { wrapper: wrap(qc) });
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync({ id: 12, startsAt: '2026-10-21T18:00:00.000Z' });
    });

    expect(out).toEqual({ data: { id: 12 }, warnings: [warning] });
    expect(lastRequest().body).toEqual({
      action: 'update',
      communityId: CID,
      id: 12,
      startsAt: '2026-10-21T18:00:00.000Z',
    });
    expect(invalidated(qc)).toEqual(['calendar', 'detail', 'list', 'listWindow', 'otherCommunityList']);
  });

  it('usePostMeetingNotice sends action "post-notice" with the meeting id', async () => {
    fetchMock.mockImplementation(async () => json({ data: { id: 12, noticePostedAt: '2026-10-01' } }));
    const qc = newClient();
    seed(qc);

    const { result } = renderHook(() => usePostMeetingNotice(CID), { wrapper: wrap(qc) });
    await act(async () => {
      await result.current.mutateAsync(12);
    });

    expect(lastRequest()).toEqual({
      url: '/api/v1/meetings',
      method: 'POST',
      body: { action: 'post-notice', communityId: CID, id: 12 },
    });
    expect(invalidated(qc)).toEqual(['calendar', 'detail', 'list', 'listWindow', 'otherCommunityList']);
  });

  it('useDeleteMeeting sends action "delete" with the meeting id', async () => {
    fetchMock.mockImplementation(async () => json({ data: { success: true } }));
    const qc = newClient();
    seed(qc);

    const { result } = renderHook(() => useDeleteMeeting(CID), { wrapper: wrap(qc) });
    await act(async () => {
      await result.current.mutateAsync(12);
    });

    expect(lastRequest().body).toEqual({ action: 'delete', communityId: CID, id: 12 });
    expect(invalidated(qc)).toEqual(['calendar', 'detail', 'list', 'listWindow', 'otherCommunityList']);
  });

  it('a refused write surfaces the server message and invalidates nothing', async () => {
    fetchMock.mockImplementation(async () =>
      json({ error: { code: 'VALIDATION_ERROR', message: 'startsAt is in the past' } }, 400),
    );
    const qc = newClient();
    seed(qc);

    const { result } = renderHook(() => useCreateMeeting(CID), { wrapper: wrap(qc) });
    await act(async () => {
      await expect(result.current.mutateAsync(payload)).rejects.toThrow('startsAt is in the past');
    });
    expect(invalidated(qc)).toEqual([]);
  });
});
