'use client';

/**
 * useDataSearch — Fires parallel search API requests with progressive rendering.
 *
 * Each entity endpoint is called in parallel. Results stream into state as they
 * resolve. Group order locks at first paint (late arrivals append, never re-sort).
 * AbortController cancels all in-flight requests on new input.
 */
import { useCallback, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DataSearchResult {
  id: string | number;
  title: string;
  subtitle: string;
  href: string;
  entityType: string;
  relevance: number;
  [key: string]: unknown;
}

export type GroupStatus = 'idle' | 'loading' | 'loaded' | 'error';

export interface DataSearchGroup {
  key: string;
  label: string;
  status: GroupStatus;
  results: DataSearchResult[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Endpoint configuration
// ---------------------------------------------------------------------------

const ENTITY_ENDPOINTS = [
  { key: 'documents', label: 'Documents', path: '/api/v1/search/documents', adminOnly: false },
  { key: 'announcements', label: 'Announcements', path: '/api/v1/search/announcements', adminOnly: false },
  { key: 'meetings', label: 'Meetings', path: '/api/v1/search/meetings', adminOnly: false },
  { key: 'maintenance', label: 'Maintenance', path: '/api/v1/search/maintenance', adminOnly: false },
  { key: 'violations', label: 'Violations', path: '/api/v1/search/violations', adminOnly: false },
  { key: 'residents', label: 'Residents', path: '/api/v1/search/residents', adminOnly: true },
] as const;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDataSearch(isAdmin: boolean, communityId: number | null) {
  const [groups, setGroups] = useState<DataSearchGroup[]>([]);
  const [orderLocked, setOrderLocked] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const lockedOrderRef = useRef<string[]>([]);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setGroups([]);
    setOrderLocked(false);
    lockedOrderRef.current = [];
  }, []);

  const search = useCallback(
    (query: string) => {
      // Abort previous requests
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;

      // Filter endpoints by role
      const endpoints = ENTITY_ENDPOINTS.filter((ep) => !ep.adminOnly || isAdmin);

      // Reset order lock for new search
      setOrderLocked(false);
      lockedOrderRef.current = [];
      let firstPaintDone = false;

      // Initialize all groups to loading
      setGroups(
        endpoints.map((ep) => ({
          key: ep.key,
          label: ep.label,
          status: 'loading' as const,
          results: [],
        })),
      );

      // Fire all requests in parallel
      for (const ep of endpoints) {
        const params = new URLSearchParams({ q: query, limit: '3' });
        if (communityId) params.set('communityId', String(communityId));
        const url = `${ep.path}?${params.toString()}`;

        fetch(url, { signal: controller.signal })
          .then((res) => {
            if (!res.ok) throw new Error(`${res.status}`);
            return res.json();
          })
          .then((data: { results: DataSearchResult[]; totalCount: number; status: string }) => {
            if (controller.signal.aborted) return;

            setGroups((prev) => {
              const updated = prev.map((g) =>
                g.key === ep.key
                  ? { ...g, status: 'loaded' as const, results: data.results }
                  : g,
              );

              // Lock order at first paint — groups that arrived first define the order
              if (!firstPaintDone) {
                firstPaintDone = true;
                lockedOrderRef.current = updated
                  .filter((g) => g.status === 'loaded' && g.results.length > 0)
                  .map((g) => g.key);
                setOrderLocked(true);
              } else {
                // Late arrival — append to locked order if it has results
                if (
                  data.results.length > 0 &&
                  !lockedOrderRef.current.includes(ep.key)
                ) {
                  lockedOrderRef.current.push(ep.key);
                }
              }

              return updated;
            });
          })
          .catch((err) => {
            if (controller.signal.aborted) return;
            if (err instanceof Error && err.name === 'AbortError') return;

            setGroups((prev) =>
              prev.map((g) =>
                g.key === ep.key
                  ? { ...g, status: 'error' as const, error: err.message }
                  : g,
              ),
            );
          });
      }
    },
    [isAdmin, communityId],
  );

  // Return groups in locked order (loaded groups with results),
  // with loading groups appended at the end
  const orderedGroups = orderLocked
    ? [
        // First: groups in locked order that have results
        ...lockedOrderRef.current
          .map((key) => groups.find((g) => g.key === key))
          .filter((g): g is DataSearchGroup => g != null && g.results.length > 0),
        // Then: still-loading groups
        ...groups.filter((g) => g.status === 'loading'),
      ]
    : groups.filter((g) => g.status === 'loading' || g.results.length > 0);

  const isSearching = groups.some((g) => g.status === 'loading');

  return { groups: orderedGroups, search, reset, isSearching };
}
