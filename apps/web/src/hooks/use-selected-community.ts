/**
 * useSelectedCommunity — P3-46
 *
 * Manages PM recent-community selection in localStorage.
 * - Key: propertypro.pm.recentCommunityIds
 * - Ordering: newest first (prepend on select)
 * - Deduped: existing entry removed before prepend
 * - Max 5 entries
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'propertypro.pm.recentCommunityIds';
const MAX_RECENT = 5;

function readFromStorage(): number[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0);
  } catch {
    return [];
  }
}

function writeToStorage(ids: number[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Ignore write failures (private browsing, quota exceeded, etc.)
  }
}

/**
 * Returns recent community IDs (newest first) and a function to record a selection.
 */
export function useSelectedCommunity(): {
  recentCommunityIds: number[];
  selectCommunity: (communityId: number) => void;
} {
  const [recentCommunityIds, setRecentCommunityIds] = useState<number[]>([]);
  // Track whether we've completed the initial hydration so that the sync
  // effect does not redundantly write the value we just read from storage.
  const hasMounted = useRef(false);

  // Hydrate from localStorage on mount (client only)
  useEffect(() => {
    setRecentCommunityIds(readFromStorage());
    hasMounted.current = true;
  }, []);

  // Sync state to localStorage whenever it changes — but skip the initial
  // hydration write so we don't clobber storage with the empty initial state
  // before readFromStorage() has run.
  useEffect(() => {
    if (!hasMounted.current) return;
    writeToStorage(recentCommunityIds);
  }, [recentCommunityIds]);

  const selectCommunity = useCallback((communityId: number) => {
    setRecentCommunityIds((prev) => {
      // Dedupe: remove existing entry if present
      const deduped = prev.filter((id) => id !== communityId);
      // Prepend new selection, cap at MAX_RECENT
      return [communityId, ...deduped].slice(0, MAX_RECENT);
    });
  }, []);

  return { recentCommunityIds, selectCommunity };
}
