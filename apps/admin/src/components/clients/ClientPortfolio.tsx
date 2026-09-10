'use client';

/**
 * Client Portfolio — interactive grid with quick filters, search/type/sort,
 * and the root-claim dispute queue folded in from the old Rootless
 * Communities page (Task 15 / spec D9).
 *
 * Stale-demo props and UI (the "Stale Demos" card + delete-confirm dialog)
 * are removed here — that surface moves onto the Demos page in Task 18
 * (`components/demo/StaleDemosBanner.tsx`), not this component.
 */
import { useState, useMemo, useEffect } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import { QuickFilterTabs } from '@propertypro/ui';
import { AdminPageHeader } from '@/components/shell/AdminPageHeader';
import { ClientCard } from './ClientCard';
import { DisputeBanner } from './DisputeBanner';
import type { ClientRow, OpenDispute, ClientCounts } from '@/lib/server/clients';

const PAGE_SIZE = 20;

export type ClientFilter = 'all' | 'past_due' | 'at_risk' | 'trialing' | 'rootless';

/**
 * Pure filter/search/type composition — exported for unit tests
 * (`__tests__/clients/client-filters.test.ts`). Search matches on community
 * NAME only, matching the pre-existing search box behavior; widening it to
 * slug/city/etc. is a deliberate future decision, not silently folded in here.
 */
export function applyClientFilter(
  rows: ClientRow[],
  filter: ClientFilter,
  search: string,
  type: string,
): ClientRow[] {
  let result = rows;

  switch (filter) {
    case 'past_due':
      result = result.filter((r) => r.subscription_status === 'past_due');
      break;
    case 'at_risk':
      result = result.filter((r) => r.complianceScore !== null && r.complianceScore < 70);
      break;
    case 'trialing':
      result = result.filter((r) => r.subscription_status === 'trialing');
      break;
    case 'rootless':
      result = result.filter((r) => r.rootless);
      break;
    case 'all':
    default:
      break;
  }

  if (type !== 'all') {
    result = result.filter((r) => r.community_type === type);
  }

  if (search.trim()) {
    const q = search.toLowerCase();
    result = result.filter((r) => r.name.toLowerCase().includes(q));
  }

  return result;
}

interface ClientPortfolioProps {
  clients: ClientRow[];
  disputes: OpenDispute[];
  counts: ClientCounts;
  /** Seeds the active quick filter from `?filter=` — a dashboard queue or nav-entry deep link. */
  initialFilter?: ClientFilter;
  /** Seeds the search box from `?q=`. */
  initialSearch?: string;
}

const FILTER_TABS: { label: string; value: ClientFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Past due', value: 'past_due' },
  { label: 'At risk', value: 'at_risk' },
  { label: 'Trialing', value: 'trialing' },
  { label: 'Rootless', value: 'rootless' },
];

export function ClientPortfolio({ clients, disputes, counts, initialFilter, initialSearch }: ClientPortfolioProps) {
  const [filter, setFilter] = useState<ClientFilter>(initialFilter ?? 'all');
  const [search, setSearch] = useState(initialSearch ?? '');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sort, setSort] = useState<'name-asc' | 'name-desc' | 'created-asc' | 'created-desc' | 'compliance-asc' | 'compliance-desc'>('name-asc');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const result = applyClientFilter(clients, filter, search, typeFilter);
    return [...result].sort((a, b) => {
      switch (sort) {
        case 'name-asc': return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'created-asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'created-desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'compliance-asc': return (a.complianceScore ?? 101) - (b.complianceScore ?? 101);
        case 'compliance-desc': return (b.complianceScore ?? -1) - (a.complianceScore ?? -1);
        default: return 0;
      }
    });
  }, [clients, filter, search, typeFilter, sort]);

  // Reset pagination when filters change.
  useEffect(() => {
    setPage(1);
  }, [filter, search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  const isFiltered = filtered.length < clients.length;
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const showDisputes = filter === 'all' || filter === 'rootless';

  const tabCounts: Record<ClientFilter, number> = {
    all: counts.all,
    past_due: counts.pastDue,
    at_risk: counts.atRisk,
    trialing: counts.trialing,
    rootless: counts.rootless,
  };

  return (
    // No root padding: the `(console)` shell already applies
    // `mx-auto max-w-7xl px-4 py-6 md:px-8` (`AdminShell.tsx`), so a `p-6` here
    // double-gutters the page. Every other surface this wave restyled roots in
    // `PageBody` or a bare `space-y-*`.
    <div className="space-y-6">
      <AdminPageHeader
        title="Client Portfolio"
        description={
          isFiltered
            ? `${filtered.length} of ${clients.length} communities`
            : `${clients.length} communities`
        }
      />

      {/* Quick filters */}
      <QuickFilterTabs
        tabs={FILTER_TABS.map((tab) => ({ ...tab, count: tabCounts[tab.value] }))}
        active={filter}
        onChange={(value) => setFilter(value as ClientFilter)}
      />

      {/* Dispute queue */}
      {showDisputes && <DisputeBanner disputes={disputes} />}

      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-content-disabled" />
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-edge-strong py-1.5 pl-8 pr-3 text-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
          />
        </div>

        {/* Type filter */}
        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="appearance-none rounded-md border border-edge-strong py-1.5 pl-3 pr-8 text-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
          >
            <option value="all">All types</option>
            <option value="condo_718">Condo §718</option>
            <option value="hoa_720">HOA §720</option>
            <option value="apartment">Apartment</option>
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-content-disabled" />
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="appearance-none rounded-md border border-edge-strong py-1.5 pl-3 pr-8 text-sm focus:border-coral-500 focus:outline-none focus:ring-1 focus:ring-coral-500"
          >
            <option value="name-asc">Name (A–Z)</option>
            <option value="name-desc">Name (Z–A)</option>
            <option value="created-desc">Newest first</option>
            <option value="created-asc">Oldest first</option>
            <option value="compliance-asc">Compliance (worst first)</option>
            <option value="compliance-desc">Compliance (best first)</option>
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-content-disabled" />
        </div>
      </div>

      {/* Community grid */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-edge bg-surface-card py-16 text-center">
          <p className="text-sm text-content-tertiary">No communities match your filters.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {paginated.map((c) => (
              <ClientCard key={c.id} client={c} />
            ))}
          </div>

          {totalPages > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((currentPage) => currentPage - 1)}
                disabled={page === 1}
                className="rounded-md border border-edge-strong px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-page disabled:cursor-not-allowed disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-xs text-content-tertiary">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((currentPage) => currentPage + 1)}
                disabled={page === totalPages}
                className="rounded-md border border-edge-strong px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:bg-surface-page disabled:cursor-not-allowed disabled:opacity-50"
              >
                Next
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
