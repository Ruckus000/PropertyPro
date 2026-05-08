/**
 * Unit tests for `apps/web/src/lib/api/violations.ts` — the `listViolations`
 * client helper that walks the canonical paginated `/api/v1/violations`
 * envelope and JS-slices to the requested page window.
 *
 * Covers:
 * - `signal` forwarded to `walkPaginated` (race-condition fix from #228 review)
 * - Page-N + limit JS-slice math (rows 21-40 etc.)
 * - `meta.total` reflects the full walked length
 * - URL query params built correctly (status/severity/unitId/createdAfter/createdBefore)
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { walkPaginatedMock } = vi.hoisted(() => ({
  walkPaginatedMock: vi.fn(),
}));

vi.mock('@/lib/api/walk-paginated', () => ({
  walkPaginated: walkPaginatedMock,
}));

import { listViolations } from '../violations';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listViolations', () => {
  it('forwards an AbortSignal to walkPaginated', async () => {
    walkPaginatedMock.mockResolvedValueOnce([]);
    const controller = new AbortController();

    await listViolations(99, undefined, controller.signal);

    const [baseUrl, params, options] = walkPaginatedMock.mock.calls[0] as [
      string,
      Record<string, string>,
      { signal?: AbortSignal },
    ];
    expect(baseUrl).toBe('/api/v1/violations');
    expect(params.communityId).toBe('99');
    expect(options.signal).toBe(controller.signal);
  });

  it('omits `signal` from options when not provided', async () => {
    walkPaginatedMock.mockResolvedValueOnce([]);

    await listViolations(99);

    const [, , options] = walkPaginatedMock.mock.calls[0] as [
      string,
      Record<string, string>,
      { signal?: AbortSignal },
    ];
    expect(options.signal).toBeUndefined();
  });

  it('forwards filter params into the URL', async () => {
    walkPaginatedMock.mockResolvedValueOnce([]);

    await listViolations(99, {
      status: 'resolved',
      severity: 'major',
      unitId: 7,
      createdAfter: '2025-01-01',
      createdBefore: '2025-06-30',
    });

    const [, params] = walkPaginatedMock.mock.calls[0] as [
      string,
      Record<string, string>,
    ];
    expect(params).toEqual({
      communityId: '99',
      status: 'resolved',
      severity: 'major',
      unitId: '7',
      createdAfter: '2025-01-01',
      createdBefore: '2025-06-30',
    });
  });

  it('JS-slices to the requested page when limit is provided (page 1)', async () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({ id: i + 1 }));
    walkPaginatedMock.mockResolvedValueOnce(rows);

    const result = await listViolations(99, { page: 1, limit: 20 });

    expect(result.data).toHaveLength(20);
    expect(result.data[0]).toEqual({ id: 1 });
    expect(result.data[19]).toEqual({ id: 20 });
    expect(result.meta).toEqual({ total: 45, page: 1, limit: 20 });
  });

  it('JS-slices to the requested page when limit is provided (page 2)', async () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({ id: i + 1 }));
    walkPaginatedMock.mockResolvedValueOnce(rows);

    const result = await listViolations(99, { page: 2, limit: 20 });

    expect(result.data).toHaveLength(20);
    expect(result.data[0]).toEqual({ id: 21 });
    expect(result.data[19]).toEqual({ id: 40 });
    expect(result.meta).toEqual({ total: 45, page: 2, limit: 20 });
  });

  it('returns the trailing partial page on the last page', async () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({ id: i + 1 }));
    walkPaginatedMock.mockResolvedValueOnce(rows);

    const result = await listViolations(99, { page: 3, limit: 20 });

    expect(result.data).toHaveLength(5); // rows 41-45
    expect(result.data[0]).toEqual({ id: 41 });
    expect(result.data[4]).toEqual({ id: 45 });
    expect(result.meta).toEqual({ total: 45, page: 3, limit: 20 });
  });

  it('returns the full walked list when no limit is provided', async () => {
    const rows = Array.from({ length: 45 }, (_, i) => ({ id: i + 1 }));
    walkPaginatedMock.mockResolvedValueOnce(rows);

    const result = await listViolations(99);

    expect(result.data).toHaveLength(45);
    expect(result.meta).toEqual({ total: 45, page: 1, limit: 45 });
  });

  it('propagates AbortError from walkPaginated', async () => {
    const abortErr = new DOMException('aborted', 'AbortError');
    walkPaginatedMock.mockRejectedValueOnce(abortErr);

    const controller = new AbortController();
    controller.abort();

    await expect(listViolations(99, undefined, controller.signal)).rejects.toBe(abortErr);
  });
});
