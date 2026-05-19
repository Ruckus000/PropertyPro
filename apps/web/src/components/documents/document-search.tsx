'use client';

import { useEffect, useRef, useState } from 'react';

import { useDocumentSearch } from '@/hooks/use-document-search';

export type { DocumentSearchRecord } from '@/hooks/use-document-search';

export interface DocumentSearchProps {
  communityId: number;
  /** Pre-populate search from command palette "View all" link */
  initialQuery?: string;
}

export function DocumentSearch({ communityId, initialQuery }: DocumentSearchProps) {
  const [query, setQuery] = useState(initialQuery ?? '');
  const didAutoSearch = useRef(false);
  const { items, nextCursor, error, isPending, runSearch } = useDocumentSearch(communityId);

  // Auto-trigger search when initialQuery is provided
  useEffect(() => {
    if (initialQuery && !didAutoSearch.current) {
      didAutoSearch.current = true;
      runSearch(query, null);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <section className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          // Guard the Enter-key path: the submit button is disabled while
          // pending, but Enter can still fire onSubmit in some browsers.
          if (isPending) return;
          runSearch(query, null);
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
          onClick={() => runSearch(query, nextCursor)}
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
