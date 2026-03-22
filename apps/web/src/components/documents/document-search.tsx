'use client';

import { useEffect, useRef, useState, useTransition } from 'react';

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

export interface DocumentSearchProps {
  communityId: number;
  /** Pre-populate search from command palette "View all" link */
  initialQuery?: string;
}

export function DocumentSearch({ communityId, initialQuery }: DocumentSearchProps) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const didAutoSearch = useRef(false);
  const [items, setItems] = useState<DocumentSearchRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const fetchResults = (cursor?: number | null) => {
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

        const json = (await res.json()) as DocumentSearchResponse;
        setItems((prev) => (cursor ? [...prev, ...json.data] : json.data));
        setNextCursor(json.pagination.nextCursor);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Search failed');
      }
    });
  };

  // Auto-trigger search when initialQuery is provided
  useEffect(() => {
    if (initialQuery && !didAutoSearch.current) {
      didAutoSearch.current = true;
      fetchResults(null);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          fetchResults(null);
        }}
      >
        <input
          className="w-full rounded-md border border-edge-strong px-3 py-2 text-sm"
          placeholder="Search documents"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <button
          type="submit"
          className="rounded-md bg-interactive px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          disabled={isPending}
        >
          Search
        </button>
      </form>

      {error ? <p className="text-sm text-status-danger">{error}</p> : null}

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-md border border-edge p-3">
            <p className="font-medium text-content">{item.title}</p>
            <p className="text-sm text-content-secondary">{item.description ?? item.fileName}</p>
          </li>
        ))}
      </ul>

      {nextCursor ? (
        <button
          type="button"
          onClick={() => fetchResults(nextCursor)}
          className="rounded-md border border-edge-strong px-4 py-2 text-sm"
          disabled={isPending}
        >
          Load more
        </button>
      ) : null}
    </section>
  );
}

export default DocumentSearch;
