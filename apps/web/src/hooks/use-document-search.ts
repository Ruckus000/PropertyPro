'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';

export interface DocumentSearchRecord {
  id: number;
  title: string;
  description: string | null;
  fileName: string;
  mimeType: string;
  createdAt: string;
  rank: number;
}

interface DocumentSearchResponse {
  data: {
    data: DocumentSearchRecord[];
    pagination: {
      nextCursor: number | null;
      limit: number;
    };
  };
}

export interface UseDocumentSearchResult {
  items: DocumentSearchRecord[];
  nextCursor: number | null;
  error: string | null;
  isPending: boolean;
  runSearch: (query: string, cursor?: number | null) => void;
}

export function useDocumentSearch(communityId: number): UseDocumentSearchResult {
  const [items, setItems] = useState<DocumentSearchRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // The query that produced the current result set. Pagination ("Load
  // more") must reuse this, not the live input — otherwise editing the
  // input and clicking "Load more" fetches page 2 of the new query with
  // page 1's cursor and appends it, mixing result sets.
  const activeQuery = useRef('');

  // Reset transient state when the community changes — matches the
  // hook-authoring checklist (clear keyed-id state) so a tenant switch
  // doesn't show the previous community's results/error.
  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    setError(null);
    activeQuery.current = '';
  }, [communityId]);

  const runSearch = useCallback((query: string, cursor?: number | null) => {
    startTransition(async () => {
      try {
        setError(null);
        // A cursor-less call is a fresh search: it becomes the new
        // active query. A cursored call ("Load more") must keep
        // paginating the query that produced the current results.
        const effectiveQuery = cursor ? activeQuery.current : query;
        if (!cursor) {
          activeQuery.current = query;
        }
        const params = new URLSearchParams({
          communityId: String(communityId),
          q: effectiveQuery,
        });
        if (cursor) {
          params.set('cursor', String(cursor));
        }

        const res = await fetch(`/api/v1/documents/search?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Search failed (${res.status})`);
        }

        const json = (await res.json()) as DocumentSearchResponse;
        const page = json.data;
        setItems((prev) => (cursor ? [...prev, ...page.data] : page.data));
        setNextCursor(page.pagination.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      }
    });
  }, [communityId]);

  return { items, nextCursor, error, isPending, runSearch };
}
