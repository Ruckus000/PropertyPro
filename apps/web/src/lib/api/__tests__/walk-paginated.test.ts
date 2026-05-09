/**
 * Unit tests for `walkAndSlice` — the shared offset-style page-window
 * helper extracted from #228 violations / #236 work-orders / #237
 * maintenance-requests slice math.
 *
 * `walkPaginated` itself is exercised indirectly here (through the
 * `walkAndSlice` callsite) and directly via `requestJson` mocking. The
 * specific behaviors covered:
 * - JS-slice math at page boundaries
 * - `meta.total = walked.length` regardless of page window
 * - `limit` defaulting + `limit === 0` defensive case
 * - signal forwarding through to walkPaginated
 * - filter param URL construction
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { requestJsonMock } = vi.hoisted(() => ({
  requestJsonMock: vi.fn(),
}));

vi.mock('../request-json', () => ({
  requestJson: requestJsonMock,
}));

import { walkAndSlice } from '../walk-paginated';

beforeEach(() => {
  vi.clearAllMocks();
});

function paginatedPage<T>(rows: T[]) {
  return {
    data: rows,
    pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
  };
}

describe('walkAndSlice', () => {
  it('returns the full walked list when no limit is provided', async () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({ id: i + 1 }));
    requestJsonMock.mockResolvedValueOnce(paginatedPage(rows));

    const result = await walkAndSlice('/api/v1/example', { communityId: '99' });

    expect(result.data).toHaveLength(45);
    expect(result.meta).toEqual({ total: 45, page: 1, limit: 45 });
  });

  it('JS-slices to page=1 / limit=20 (rows 1-20)', async () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({ id: i + 1 }));
    requestJsonMock.mockResolvedValueOnce(paginatedPage(rows));

    const result = await walkAndSlice<{ id: number }>(
      '/api/v1/example',
      { communityId: '99' },
      { page: 1, limit: 20 },
    );

    expect(result.data).toHaveLength(20);
    expect(result.data[0]).toEqual({ id: 1 });
    expect(result.data[19]).toEqual({ id: 20 });
    expect(result.meta).toEqual({ total: 45, page: 1, limit: 20 });
  });

  it('JS-slices to page=2 / limit=20 (rows 21-40)', async () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({ id: i + 1 }));
    requestJsonMock.mockResolvedValueOnce(paginatedPage(rows));

    const result = await walkAndSlice<{ id: number }>(
      '/api/v1/example',
      { communityId: '99' },
      { page: 2, limit: 20 },
    );

    expect(result.data).toHaveLength(20);
    expect(result.data[0]).toEqual({ id: 21 });
    expect(result.data[19]).toEqual({ id: 40 });
    expect(result.meta.total).toBe(45);
  });

  it('returns the trailing partial page on the last page', async () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({ id: i + 1 }));
    requestJsonMock.mockResolvedValueOnce(paginatedPage(rows));

    const result = await walkAndSlice<{ id: number }>(
      '/api/v1/example',
      { communityId: '99' },
      { page: 3, limit: 20 },
    );

    expect(result.data).toHaveLength(5); // rows 41-45
    expect(result.data[0]).toEqual({ id: 41 });
    expect(result.data[4]).toEqual({ id: 45 });
    expect(result.meta).toEqual({ total: 45, page: 3, limit: 20 });
  });

  it('returns the full list when limit is 0 (defensive against bad UI input)', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }));
    requestJsonMock.mockResolvedValueOnce(paginatedPage(rows));

    const result = await walkAndSlice<{ id: number }>(
      '/api/v1/example',
      { communityId: '99' },
      { page: 1, limit: 0 },
    );

    expect(result.data).toHaveLength(5);
    // meta still echoes the requested limit, not the slice length.
    expect(result.meta).toEqual({ total: 5, page: 1, limit: 0 });
  });

  it('clamps offset to 0 when page is negative or zero', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
    requestJsonMock.mockResolvedValueOnce(paginatedPage(rows));

    const result = await walkAndSlice<{ id: number }>(
      '/api/v1/example',
      { communityId: '99' },
      { page: -3, limit: 5 },
    );

    // (page=-3, limit=5) → offset = max(0, -20) = 0; first 5 rows.
    expect(result.data).toHaveLength(5);
    expect(result.data[0]).toEqual({ id: 1 });
  });

  it('returns empty data when the slice is past the end', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
    requestJsonMock.mockResolvedValueOnce(paginatedPage(rows));

    const result = await walkAndSlice<{ id: number }>(
      '/api/v1/example',
      { communityId: '99' },
      { page: 5, limit: 20 },
    );

    expect(result.data).toEqual([]);
    expect(result.meta.total).toBe(10);
  });

  it('forwards filter params into the URL via baseParams', async () => {
    requestJsonMock.mockResolvedValueOnce(paginatedPage([]));

    await walkAndSlice('/api/v1/example', {
      communityId: '99',
      status: 'open',
      foo: 'bar',
    });

    const [url] = requestJsonMock.mock.calls[0] as [string, RequestInit | undefined];
    // walkPaginated appends pageSize=100 + cursor (when present).
    expect(url).toContain('communityId=99');
    expect(url).toContain('status=open');
    expect(url).toContain('foo=bar');
    expect(url).toContain('pageSize=100');
  });

  it('forwards an AbortSignal to walkPaginated → requestJson init', async () => {
    requestJsonMock.mockResolvedValueOnce(paginatedPage([]));
    const controller = new AbortController();

    await walkAndSlice('/api/v1/example', { communityId: '99' }, {
      signal: controller.signal,
    });

    const [, init] = requestJsonMock.mock.calls[0] as [string, RequestInit | undefined];
    expect(init?.signal).toBe(controller.signal);
  });

  it('walks multiple pages until hasMore=false, then JS-slices the accumulated list', async () => {
    requestJsonMock
      .mockResolvedValueOnce({
        data: [{ id: 1 }, { id: 2 }],
        pagination: { nextCursor: 'cursor-1', hasMore: true, pageSize: 100 },
      })
      .mockResolvedValueOnce({
        data: [{ id: 3 }, { id: 4 }],
        pagination: { nextCursor: 'cursor-2', hasMore: true, pageSize: 100 },
      })
      .mockResolvedValueOnce({
        data: [{ id: 5 }],
        pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
      });

    const result = await walkAndSlice<{ id: number }>(
      '/api/v1/example',
      { communityId: '99' },
      { page: 1, limit: 3 },
    );

    expect(requestJsonMock).toHaveBeenCalledTimes(3);
    // walked length = 5; sliced to first 3.
    expect(result.data).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
    expect(result.meta).toEqual({ total: 5, page: 1, limit: 3 });
  });
});
