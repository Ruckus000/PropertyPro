import { describe, expect, it, vi, beforeEach, type Mock } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  meetsUserSearchMinLength,
  USER_SEARCH_FETCH_LIMIT,
  useUserSearch,
} from '../use-user-search';

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

describe('meetsUserSearchMinLength', () => {
  it('requires 2 characters for alpha searches and 1 for numeric searches', () => {
    expect(meetsUserSearchMinLength('')).toBe(false);
    expect(meetsUserSearchMinLength('a')).toBe(false);
    expect(meetsUserSearchMinLength('ab')).toBe(true);
    expect(meetsUserSearchMinLength('1')).toBe(true);
  });
});

describe('useUserSearch', () => {
  it('does not fetch when the query is below the minimum length', async () => {
    const { result } = renderHook(() => useUserSearch(7));

    await expect(result.current('a', new AbortController().signal)).resolves.toEqual([]);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('builds the user search request and parses the wrapped results payload', async () => {
    mockFetch.mockReturnValue(
      jsonResponse({
        data: {
          results: [{ id: 'u1', title: 'Cameron CAM', subtitle: 'CAM' }],
        },
      }),
    );
    const controller = new AbortController();
    const { result } = renderHook(() => useUserSearch(7));

    await expect(result.current(' ca ', controller.signal)).resolves.toEqual([
      { id: 'u1', title: 'Cameron CAM', subtitle: 'CAM' },
    ]);

    expect(mockFetch).toHaveBeenCalledWith(
      `/api/v1/search/users?communityId=7&q=ca&limit=${USER_SEARCH_FETCH_LIMIT}`,
      { signal: controller.signal },
    );
  });

  it('throws when the search route returns an error', async () => {
    mockFetch.mockReturnValue(jsonResponse({ error: 'nope' }, 403));
    const { result } = renderHook(() => useUserSearch(7));

    await expect(result.current('ca', new AbortController().signal)).rejects.toThrow(
      'Search failed',
    );
  });
});
