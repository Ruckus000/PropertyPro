/**
 * Unit tests for `apps/web/src/lib/api/violations.ts` — the `listViolations`
 * client helper that delegates to `walkAndSlice`.
 *
 * Slice-math + signal-forwarding behaviors moved to `walk-paginated.test.ts`
 * (the helper extracted in this PR). Tests here verify only what's
 * helper-specific:
 * - URL + baseParams construction (filter passthrough)
 * - signal forwarded into the helper's options
 * - page+limit options forwarded into the helper's options
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';

const { walkAndSliceMock } = vi.hoisted(() => ({
  walkAndSliceMock: vi.fn(),
}));

vi.mock('@/lib/api/walk-paginated', () => ({
  walkAndSlice: walkAndSliceMock,
}));

import { listViolations } from '../violations';

beforeEach(() => {
  vi.clearAllMocks();
  walkAndSliceMock.mockResolvedValue({ data: [], meta: { total: 0, page: 1, limit: 0 } });
});

describe('listViolations', () => {
  it('forwards an AbortSignal to walkAndSlice', async () => {
    const controller = new AbortController();

    await listViolations(99, undefined, controller.signal);

    const [baseUrl, params, options] = walkAndSliceMock.mock.calls[0] as [
      string,
      Record<string, string>,
      { signal?: AbortSignal },
    ];
    expect(baseUrl).toBe('/api/v1/violations');
    expect(params.communityId).toBe('99');
    expect(options.signal).toBe(controller.signal);
  });

  it('omits `signal` from options when not provided', async () => {
    await listViolations(99);

    const [, , options] = walkAndSliceMock.mock.calls[0] as [
      string,
      Record<string, string>,
      { signal?: AbortSignal },
    ];
    expect(options.signal).toBeUndefined();
  });

  it('forwards filter params into the URL via baseParams', async () => {
    await listViolations(99, {
      status: 'resolved',
      severity: 'major',
      unitId: 7,
      createdAfter: '2025-01-01',
      createdBefore: '2025-06-30',
    });

    const [, params] = walkAndSliceMock.mock.calls[0] as [
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

  it('forwards page + limit options to walkAndSlice', async () => {
    await listViolations(99, { page: 3, limit: 20 });

    const [, , options] = walkAndSliceMock.mock.calls[0] as [
      string,
      Record<string, string>,
      { page?: number; limit?: number },
    ];
    expect(options.page).toBe(3);
    expect(options.limit).toBe(20);
  });

  it('returns whatever walkAndSlice returns (passthrough)', async () => {
    const sliced = {
      data: [{ id: 1 }, { id: 2 }],
      meta: { total: 45, page: 2, limit: 20 },
    };
    walkAndSliceMock.mockResolvedValueOnce(sliced);

    const result = await listViolations(99, { page: 2, limit: 20 });

    expect(result).toBe(sliced);
  });

  it('propagates AbortError from walkAndSlice', async () => {
    const abortErr = new DOMException('aborted', 'AbortError');
    walkAndSliceMock.mockRejectedValueOnce(abortErr);

    const controller = new AbortController();
    controller.abort();

    await expect(listViolations(99, undefined, controller.signal)).rejects.toBe(abortErr);
  });
});
