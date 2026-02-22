import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// jsdom provides localStorage — ensure it's clean between tests
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

import { useSelectedCommunity } from '../../src/hooks/useSelectedCommunity';

const STORAGE_KEY = 'propertypro.pm.recentCommunityIds';

describe('useSelectedCommunity', () => {
  describe('initial state', () => {
    it('returns empty array when localStorage has no data', () => {
      const { result } = renderHook(() => useSelectedCommunity());
      // After hydration effect
      expect(result.current.recentCommunityIds).toEqual([]);
    });

    it('hydrates from existing localStorage data', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([5, 3, 1]));
      const { result } = renderHook(() => useSelectedCommunity());
      // Wait for useEffect to run
      await act(async () => {});
      expect(result.current.recentCommunityIds).toEqual([5, 3, 1]);
    });

    it('returns empty array when localStorage has malformed JSON', async () => {
      localStorage.setItem(STORAGE_KEY, 'not-json');
      const { result } = renderHook(() => useSelectedCommunity());
      await act(async () => {});
      expect(result.current.recentCommunityIds).toEqual([]);
    });

    it('returns empty array when localStorage has non-array JSON', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ id: 1 }));
      const { result } = renderHook(() => useSelectedCommunity());
      await act(async () => {});
      expect(result.current.recentCommunityIds).toEqual([]);
    });
  });

  describe('selectCommunity', () => {
    it('prepends new community to the list (newest first)', async () => {
      const { result } = renderHook(() => useSelectedCommunity());
      await act(async () => {});

      act(() => result.current.selectCommunity(10));
      act(() => result.current.selectCommunity(20));
      act(() => result.current.selectCommunity(30));

      expect(result.current.recentCommunityIds).toEqual([30, 20, 10]);
    });

    it('dedupes: moves existing community to front instead of duplicating', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
      const { result } = renderHook(() => useSelectedCommunity());
      await act(async () => {});

      act(() => result.current.selectCommunity(2));

      expect(result.current.recentCommunityIds).toEqual([2, 1, 3]);
    });

    it('dedupes when selecting the front element again', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3]));
      const { result } = renderHook(() => useSelectedCommunity());
      await act(async () => {});

      act(() => result.current.selectCommunity(1));

      expect(result.current.recentCommunityIds).toEqual([1, 2, 3]);
    });

    it('caps list at 5 entries', async () => {
      const { result } = renderHook(() => useSelectedCommunity());
      await act(async () => {});

      act(() => result.current.selectCommunity(1));
      act(() => result.current.selectCommunity(2));
      act(() => result.current.selectCommunity(3));
      act(() => result.current.selectCommunity(4));
      act(() => result.current.selectCommunity(5));
      act(() => result.current.selectCommunity(6));

      expect(result.current.recentCommunityIds).toHaveLength(5);
      expect(result.current.recentCommunityIds[0]).toBe(6);
      // Oldest entry (1) should have been dropped
      expect(result.current.recentCommunityIds).not.toContain(1);
    });

    it('persists selection to localStorage', async () => {
      const { result } = renderHook(() => useSelectedCommunity());
      await act(async () => {});

      act(() => result.current.selectCommunity(42));

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as number[];
      expect(stored).toEqual([42]);
    });

    it('persists dedupe + cap behavior to localStorage', async () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([1, 2, 3, 4, 5]));
      const { result } = renderHook(() => useSelectedCommunity());
      await act(async () => {});

      act(() => result.current.selectCommunity(6));

      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as number[];
      expect(stored).toEqual([6, 1, 2, 3, 4]);
      expect(stored).not.toContain(5);
    });
  });
});
