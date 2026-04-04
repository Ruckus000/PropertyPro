import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDataSearch } from '../../src/components/command-palette/useDataSearch';
import type { SearchGroupConfig } from '../../src/lib/search/group-config';

const SEARCH_GROUPS: readonly SearchGroupConfig[] = [
  { key: 'documents', label: 'Documents', resource: 'documents' },
  { key: 'announcements', label: 'Announcements', resource: 'announcements' },
] as const;

describe('useDataSearch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('normalizes aggregated search results into the configured group order', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        requestId: 'req-1',
        communityId: 42,
        partial: false,
        groups: [
          {
            key: 'announcements',
            label: 'Announcements',
            status: 'ok',
            totalCount: 1,
            results: [
              {
                id: 2,
                title: 'Board update',
                subtitle: 'Everyone',
                href: '/announcements/2?communityId=42',
                entityType: 'announcement',
                relevance: 0.9,
              },
            ],
            durationMs: 5,
          },
          {
            key: 'documents',
            label: 'Documents',
            status: 'ok',
            totalCount: 1,
            results: [
              {
                id: 1,
                title: 'Budget',
                subtitle: 'Financials',
                href: '/documents/1',
                entityType: 'document',
                relevance: 0.8,
              },
            ],
            durationMs: 4,
          },
        ],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useDataSearch(42, SEARCH_GROUPS));

    await act(async () => {
      result.current.search('budget');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.groups.map((group) => group.key)).toEqual([
      'documents',
      'announcements',
    ]);
    expect(result.current.groups.every((group) => group.status === 'ok')).toBe(true);
  });

  it('surfaces endpoint failures as explicit group errors instead of empty success state', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom')));

    const { result } = renderHook(() => useDataSearch(42, SEARCH_GROUPS));

    await act(async () => {
      result.current.search('budget');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.isSearching).toBe(false);
    expect(result.current.groups).toHaveLength(2);
    expect(result.current.groups.every((group) => group.status === 'error')).toBe(true);
    expect(result.current.groups[0]?.error).toMatch(/temporarily unavailable/i);
  });
});
