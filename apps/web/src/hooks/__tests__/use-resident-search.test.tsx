import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  meetsResidentSearchMinLength,
  RESIDENT_SEARCH_FETCH_LIMIT,
  useResidentSearch,
} from '../use-resident-search';

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

describe('meetsResidentSearchMinLength', () => {
  it('requires 2 characters for alpha searches and 1 for numeric searches', () => {
    expect(meetsResidentSearchMinLength('')).toBe(false);
    expect(meetsResidentSearchMinLength('a')).toBe(false);
    expect(meetsResidentSearchMinLength('ab')).toBe(true);
    expect(meetsResidentSearchMinLength('1')).toBe(true);
  });
});

describe('useResidentSearch', () => {
  it('does not fetch when the query is below the minimum length', async () => {
    const { result } = renderHook(() => useResidentSearch(99));

    await expect(result.current('a', new AbortController().signal)).resolves.toEqual([]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('builds the resident search request and parses the flat results payload', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({
        results: [
          { id: 'u1', title: 'Jane Smith', subtitle: 'Unit 101', unitNumber: '101' },
        ],
      }),
    );
    const controller = new AbortController();
    const { result } = renderHook(() => useResidentSearch(99));

    await expect(result.current(' ja ', controller.signal)).resolves.toEqual([
      { id: 'u1', title: 'Jane Smith', subtitle: 'Unit 101', unitNumber: '101' },
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/v1/search/residents?communityId=99&q=ja&limit=${RESIDENT_SEARCH_FETCH_LIMIT}`,
      { signal: controller.signal },
    );
  });

  it('throws when the search route returns an error', async () => {
    mockFetch.mockReturnValue(jsonResponse({ error: 'nope' }, 403));
    const { result } = renderHook(() => useResidentSearch(99));

    await expect(result.current('ja', new AbortController().signal)).rejects.toThrow(
      'Search failed',
    );
  });
});
