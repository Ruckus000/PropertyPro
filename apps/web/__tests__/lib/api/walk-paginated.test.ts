/**
 * Unit tests for the walkPaginated() helper (Plan B3).
 *
 * Covers:
 * - Single-page walk (hasMore=false on first response)
 * - Multi-page walk (cursor chaining + concatenation)
 * - Default pageSize=100 in URL
 * - Custom pageSize override
 * - maxPages safety cap (defaults to 20; doesn't infinite-loop on
 *   misbehaving server)
 * - AbortSignal — pre-aborted signal short-circuits without fetching
 * - Error propagation from requestJson on non-OK responses
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { walkPaginated } from '../../../src/lib/api/walk-paginated';

interface Item {
  id: number;
  name: string;
}

function jsonOk(body: unknown) {
  return {
    ok: true,
    json: () => Promise.resolve(body),
  } as Response;
}

function jsonNotOk(status: number, message: string) {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ error: { message } }),
  } as unknown as Response;
}

const fetchMock = vi.fn();
global.fetch = fetchMock as unknown as typeof fetch;

describe('walkPaginated', () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the first page when hasMore is false', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        data: {
          data: [{ id: 1, name: 'A' }],
          pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
        },
      }),
    );

    const result = await walkPaginated<Item>('/api/v1/things', { communityId: '42' });

    expect(result).toEqual([{ id: 1, name: 'A' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = (fetchMock.mock.calls[0] as [string])[0];
    expect(url).toBe('/api/v1/things?communityId=42&pageSize=100');
  });

  it('walks multiple pages, concatenating data and chaining cursors', async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonOk({
          data: {
            data: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }],
            pagination: { nextCursor: 'cursor-2', hasMore: true, pageSize: 100 },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonOk({
          data: {
            data: [{ id: 3, name: 'C' }],
            pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
          },
        }),
      );

    const result = await walkPaginated<Item>('/api/v1/things', { communityId: '42' });

    expect(result).toEqual([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
      { id: 3, name: 'C' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect((fetchMock.mock.calls[0] as [string])[0]).toBe(
      '/api/v1/things?communityId=42&pageSize=100',
    );
    expect((fetchMock.mock.calls[1] as [string])[0]).toBe(
      '/api/v1/things?communityId=42&pageSize=100&cursor=cursor-2',
    );
  });

  it('honors a custom pageSize override', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        data: {
          data: [],
          pagination: { nextCursor: null, hasMore: false, pageSize: 25 },
        },
      }),
    );

    await walkPaginated<Item>('/api/v1/things', { communityId: '42' }, { pageSize: '25' });

    const url = (fetchMock.mock.calls[0] as [string])[0];
    expect(url).toContain('pageSize=25');
  });

  it('caps at maxPages even if server keeps returning hasMore=true', async () => {
    // Misbehaving server: always says there's more.
    fetchMock.mockResolvedValue(
      jsonOk({
        data: {
          data: [{ id: 1, name: 'A' }],
          pagination: { nextCursor: 'next', hasMore: true, pageSize: 100 },
        },
      }),
    );

    const result = await walkPaginated<Item>(
      '/api/v1/things',
      { communityId: '42' },
      { maxPages: 3 },
    );

    expect(result).toHaveLength(3); // 3 pages × 1 row each
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('terminates if pagination.nextCursor is null even when hasMore is true', async () => {
    // Defensive: server contract violation.
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        data: {
          data: [{ id: 1, name: 'A' }],
          pagination: { nextCursor: null, hasMore: true, pageSize: 100 },
        },
      }),
    );

    const result = await walkPaginated<Item>('/api/v1/things', { communityId: '42' });
    expect(result).toEqual([{ id: 1, name: 'A' }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('forwards the abort signal in fetch init', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        data: {
          data: [],
          pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
        },
      }),
    );

    const controller = new AbortController();
    await walkPaginated<Item>(
      '/api/v1/things',
      { communityId: '42' },
      { signal: controller.signal },
    );

    const init = (fetchMock.mock.calls[0] as [string, RequestInit | undefined])[1];
    expect(init?.signal).toBe(controller.signal);
  });

  it('returns early without fetching when signal is pre-aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await walkPaginated<Item>(
      '/api/v1/things',
      { communityId: '42' },
      { signal: controller.signal },
    );

    expect(result).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('propagates errors from non-OK responses', async () => {
    fetchMock.mockResolvedValueOnce(jsonNotOk(403, 'Forbidden'));

    await expect(
      walkPaginated<Item>('/api/v1/things', { communityId: '42' }),
    ).rejects.toThrow('Forbidden');
  });

  it('preserves caller-supplied query params', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonOk({
        data: {
          data: [],
          pagination: { nextCursor: null, hasMore: false, pageSize: 100 },
        },
      }),
    );

    await walkPaginated<Item>('/api/v1/things', {
      communityId: '42',
      status: 'pending',
    });

    const url = (fetchMock.mock.calls[0] as [string])[0];
    expect(url).toContain('communityId=42');
    expect(url).toContain('status=pending');
    expect(url).toContain('pageSize=100');
  });
});
