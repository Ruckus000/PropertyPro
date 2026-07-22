'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'propertypro.recent-pages';
const MAX_RECENT = 5;

export interface RecentPage {
  path: string;
  label: string;
  visitedAt: number;
}

function readFromStorage(): RecentPage[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.slice(0, MAX_RECENT) as RecentPage[];
  } catch {
    return [];
  }
}

function writeToStorage(pages: RecentPage[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pages.slice(0, MAX_RECENT)));
  } catch {
    // Ignore quota errors
  }
}

export function useRecentPages() {
  const [pages, setPages] = useState<RecentPage[]>([]);

  useEffect(() => {
    setPages(readFromStorage());
  }, []);

  const addPage = useCallback((path: string, label: string) => {
    setPages((prev) => {
      const filtered = prev.filter((p) => p.path !== path);
      const updated = [{ path, label, visitedAt: Date.now() }, ...filtered].slice(0, MAX_RECENT);
      writeToStorage(updated);
      return updated;
    });
  }, []);

  return { recentPages: pages, addPage };
}
