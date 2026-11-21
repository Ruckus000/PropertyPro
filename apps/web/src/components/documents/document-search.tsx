'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

import { EmptyState } from '@/components/shared/empty-state';
import { useDocumentSearch } from '@/hooks/use-document-search';

export type { DocumentSearchRecord } from '@/hooks/use-document-search';

export interface DocumentSearchProps {
  communityId: number;
  /** Pre-populate search from command palette "View all" link */
  initialQuery?: string;
}

export function DocumentSearch({ communityId, initialQuery }: DocumentSearchProps) {
  const [query, setQuery] = useState(initialQuery ?? '');
  // Whether a search has been run, so "nothing matched" is told apart from
  // "nothing asked yet".
  const [hasSearched, setHasSearched] = useState(false);
  const didAutoSearch = useRef(false);
  const { items, nextCursor, error, isPending, runSearch } = useDocumentSearch(communityId);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // A result opens through the library's `?doc=<id>` handler, the same one the
  // `/documents/<id>` redirect uses. It matches the id against the caller's
  // access-filtered list, so a result can open nothing the library would not.
  // The other params are kept so the library stays where it is.
  const documentHref = (documentId: number) => {
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('doc', String(documentId));
    return `${pathname}?${params.toString()}`;
  };

  const search = (cursor: number | null) => {
    if (cursor === null) setHasSearched(true);
    runSearch(query, cursor);
  };

  // Auto-trigger search when initialQuery is provided
  useEffect(() => {
    if (initialQuery && !didAutoSearch.current) {
      didAutoSearch.current = true;
      search(null);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const showNoResults = hasSearched && !isPending && !error && items.length === 0;

  return (
    <section className="space-y-4">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          // Guard the Enter-key path: the submit button is disabled while
          // pending, but Enter can still fire onSubmit in some browsers.
          if (isPending) return;
          search(null);
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

      {showNoResults ? <EmptyState preset="no_results" size="sm" /> : null}

      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={documentHref(item.id)}
              scroll={false}
              className="block rounded-md border border-edge p-3 hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
            >
              <span className="block font-medium text-content">{item.title}</span>
              <span className="block text-sm text-content-secondary">
                {item.description ?? item.fileName}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {nextCursor ? (
        <button
          type="button"
          onClick={() => search(nextCursor)}
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
