import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  meetsUnitSearchMinLength,
  UNIT_SEARCH_FETCH_LIMIT,
  useUnitSearch,
} from '../use-unit-search';

const mockFetch = vi.fn() as Mock;
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('meetsUnitSearchMinLength', () => {
  it('requires at least one non-whitespace character', () => {
    expect(meetsUnitSearchMinLength('')).toBe(false);
    expect(meetsUnitSearchMinLength('   ')).toBe(false);
    expect(meetsUnitSearchMinLength('A')).toBe(true);
    expect(meetsUnitSearchMinLength('1')).toBe(true);
  });
});

describe('useUnitSearch', () => {
  it('does not fetch when the query is below the minimum length', async () => {
    const { result } = renderHook(() => useUnitSearch(7));

    await expect(result.current(' ', new AbortController().signal)).resolves.toEqual([]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('builds the unit search request and parses the canonical results payload', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({
        data: {
          results: [{ id: 101, label: 'PH-A', building: 'Tower', floor: 12 }],
        },
      }),
    );
    const controller = new AbortController();
    const { result } = renderHook(() => useUnitSearch(7));

    await expect(result.current(' ph ', controller.signal)).resolves.toEqual([
      { id: 101, label: 'PH-A', building: 'Tower', floor: 12 },
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/v1/search/units?communityId=7&q=ph&limit=${UNIT_SEARCH_FETCH_LIMIT}`,
      { signal: controller.signal },
    );
  });

  it('throws when the search route returns an error', async () => {
    mockFetch.mockReturnValue(jsonResponse({ error: 'nope' }, 403));
    const { result } = renderHook(() => useUnitSearch(7));

    await expect(result.current('10', new AbortController().signal)).rejects.toThrow(
      'Search failed',
    );
  });
});
