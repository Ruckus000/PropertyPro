'use client';

/**
 * Requests — what did we send, and where has it got to.
 *
 * Filtering happens on the client, over the whole set, because the status pills
 * carry counts: asking the server for one status would make every other pill's
 * number wrong, or cost six queries to keep them right.
 */

import { useCallback, useDeferredValue, useRef, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { QuickFilterTabs } from '@/components/shared/quick-filter-tabs';
import {
  ESIGN_STATUS_FILTERS,
  countByStatus,
  filterRequests,
  type EsignRequest,
} from '@/lib/esign/submission-status';
import { RequestRow } from './request-row';

const COLUMNS = ['Document', 'Signatures', 'Expires', 'Status'] as const;

export interface RequestsViewProps {
  communityId: number;
  requests: EsignRequest[];
  now: Date;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

export function RequestsView({
  communityId,
  requests,
  now,
  isLoading,
  isError,
  onRetry,
}: RequestsViewProps) {
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const openDisclosure = useRef<HTMLButtonElement | null>(null);

  const counts = countByStatus(requests);
  const rows = filterRequests(requests, { status, query: deferredQuery });
  const isFiltered = Boolean(status) || deferredQuery.trim().length > 0;

  /**
   * Read the node BEFORE the state change: setState is batched, so the button
   * is still mounted here, and because the summary row always renders React
   * reconciles the same DOM node — the focus survives the re-render. Without
   * this, collapsing drops focus on `<body>` and a keyboard user restarts at
   * the top of the page.
   */
  const collapseAndRestoreFocus = useCallback(() => {
    const button = openDisclosure.current;
    setExpandedId(null);
    button?.focus();
  }, []);

  /** Clear the open row with the filter: a hidden row must not silently reopen. */
  const changeFilter = useCallback((next: () => void) => {
    setExpandedId(null);
    next();
  }, []);

  if (isError) {
    return (
      <AlertBanner
        status="danger"
        variant="subtle"
        title="Couldn't load your signature requests"
        description="Something went wrong while loading them."
        action={
          <Button size="sm" onClick={onRetry}>
            Try again
          </Button>
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {/*
          Six pills do not fit 375px, and `QuickFilterTabs` is a non-wrapping
          flex row — without this they are simply clipped and the last three
          filters become unreachable on a phone. Scroll them instead.
        */}
        <div className="-mx-1 w-full overflow-x-auto px-1 sm:w-auto">
          <QuickFilterTabs
            className="w-max"
            tabs={ESIGN_STATUS_FILTERS.map(([value, label]) => ({
              value,
              label,
              count: counts[value] ?? 0,
            }))}
            active={status}
            onChange={(next) => changeFilter(() => setStatus(next))}
          />
        </div>

        <label className="relative ml-auto w-full sm:w-64">
          <span className="sr-only">Filter by document or signer</span>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-content-tertiary"
          />
          <input
            type="search"
            value={query}
            placeholder="Filter document or signer…"
            onChange={(e) => changeFilter(() => setQuery(e.target.value))}
            className="h-9 w-full rounded-md border border-edge bg-surface-card pl-9 pr-3 text-sm text-content placeholder:text-content-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
          />
        </label>
      </div>

      {isLoading ? (
        <Card className="p-4">
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </Card>
      ) : rows.length === 0 ? (
        <Card className="p-6">
          {isFiltered ? (
            <EmptyState
              preset="no_results"
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setStatus('');
                    setQuery('');
                    setExpandedId(null);
                  }}
                >
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              preset="no_esign_requests"
              action={
                <Button asChild>
                  <Link href={`/esign/submissions/new?communityId=${communityId}`}>
                    Send Document
                  </Link>
                </Button>
              }
            />
          )}
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {/*
            The wrapper is owned rather than taken from the shadcn `Table`,
            which nests an `overflow-auto` div with no `tabIndex` — a scrollable
            region a keyboard-only user cannot scroll. Four columns will
            overflow on a phone.
          */}
          <div
            role="region"
            aria-label="Signature requests"
            tabIndex={0}
            className="w-full overflow-x-auto focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-focus"
          >
            <table className="w-full table-fixed caption-bottom text-sm">
              <thead>
                <tr className="border-b border-edge-subtle bg-surface-subtle">
                  <th scope="col" className="w-1/2 px-3 py-2 text-left font-medium text-content-tertiary">
                    {COLUMNS[0]}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-content-tertiary">
                    {COLUMNS[1]}
                  </th>
                  <th scope="col" className="hidden px-3 py-2 text-left font-medium text-content-tertiary md:table-cell">
                    {COLUMNS[2]}
                  </th>
                  <th scope="col" className="px-3 py-2 text-left font-medium text-content-tertiary">
                    {COLUMNS[3]}
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((request) => (
                  <RequestRow
                    key={request.id}
                    communityId={communityId}
                    request={request}
                    now={now}
                    isExpanded={expandedId === request.id}
                    onToggle={() =>
                      setExpandedId(expandedId === request.id ? null : request.id)
                    }
                    columnCount={COLUMNS.length}
                    {...(expandedId === request.id ? { disclosureRef: openDisclosure } : {})}
                    onCollapse={collapseAndRestoreFocus}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
