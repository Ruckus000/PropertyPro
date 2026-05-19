'use client';

import { useState, useTransition } from 'react';

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
  data: DocumentSearchRecord[];
  pagination: {
    nextCursor: number | null;
    limit: number;
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

  const runSearch = (query: string, cursor?: number | null) => {
    startTransition(async () => {
      try {
        setError(null);
        const params = new URLSearchParams({
          communityId: String(communityId),
          q: query,
        });
        if (cursor) {
          params.set('cursor', String(cursor));
        }

        const res = await fetch(`/api/v1/documents/search?${params.toString()}`);
        if (!res.ok) {
          throw new Error(`Search failed (${res.status})`);
        }

        // Documented exception to the requestJson rule: response is flat
        // { data: [], pagination } — requestJson returns json.data and would
        // discard pagination.
        const json = (await res.json()) as DocumentSearchResponse;
        setItems((prev) => (cursor ? [...prev, ...json.data] : json.data));
        setNextCursor(json.pagination.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      }
    });
  };

  return { items, nextCursor, error, isPending, runSearch };
}
