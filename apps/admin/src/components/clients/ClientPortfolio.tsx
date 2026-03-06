'use client';

/**
 * P1-5: Client Portfolio — interactive grid with search/filter/sort.
 */
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { Search, ChevronDown, Trash2, Plus } from 'lucide-react';
import {
  COMMUNITY_TYPE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
} from '@/lib/constants/community-labels';
import { staleBadge } from '@/lib/utils/stale-badge';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const PAGE_SIZE = 20;

interface Community {
  id: number;
  name: string;
  slug: string;
  community_type: 'condo_718' | 'hoa_720' | 'apartment';
  city: string | null;
  state: string | null;
  subscription_status: string | null;
  created_at: string;
}

interface StaleDemo {
  id: number;
  prospect_name: string;
  template_type: string;
  created_at: string;
}

interface ClientPortfolioProps {
  communities: Community[];
  staleDemos: StaleDemo[];
}

export function ClientPortfolio({ communities, staleDemos }: ClientPortfolioProps) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sort, setSort] = useState<'name-asc' | 'name-desc' | 'created-asc' | 'created-desc'>('name-asc');
  const [page, setPage] = useState(1);
  const [demoToDelete, setDemoToDelete] = useState<StaleDemo | null>(null);
  const [deletingDemoId, setDeletingDemoId] = useState<number | null>(null);

  const filtered = useMemo(() => {
    let result = communities;

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter((c) => c.name.toLowerCase().includes(q));
    }

    if (typeFilter !== 'all') {
      result = result.filter((c) => c.community_type === typeFilter);
    }

    result = [...result].sort((a, b) => {
      switch (sort) {
        case 'name-asc': return a.name.localeCompare(b.name);
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'created-asc': return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'created-desc': return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        default: return 0;
      }
    });

    return result;
  }, [communities, search, typeFilter, sort]);

  // Reset page when filters change (not sort)
  useEffect(() => {
    setPage(1);
  }, [search, typeFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const isFiltered = filtered.length !== communities.length;
  const isDeletingDemo = demoToDelete !== null && deletingDemoId === demoToDelete.id;

  const handleDeleteDemo = async () => {
    if (!demoToDelete) return;

    setDeletingDemoId(demoToDelete.id);
    try {
      const res = await fetch(`/api/admin/demos/${demoToDelete.id}`, { method: 'DELETE' });
      if (res.ok) {
        setDemoToDelete(null);
        router.refresh();
      }
    } finally {
      setDeletingDemoId(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Client Portfolio</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {isFiltered
              ? `${filtered.length} of ${communities.length} communities`
              : `${communities.length} communities`}
          </p>
        </div>
        <Link
          href="/clients/new"
          className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Create Client
        </Link>
      </div>

      {/* Stale Demos card — positioned above filter controls */}
      {staleDemos.length > 0 && (
        <div className="rounded-lg border border-yellow-200 bg-white p-5 shadow-e1">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">
              Stale Demos
              <span className="ml-2 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700">
                {staleDemos.length}
              </span>
            </h2>
            <Link
              href="/demo"
              className="text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Manage demos &rarr;
            </Link>
          </div>
          <div className="space-y-2">
            {staleDemos.map((demo) => {
              const badge = staleBadge(demo.created_at);
              const typeLabel = COMMUNITY_TYPE_LABELS[demo.template_type]?.label ?? demo.template_type;
              return (
                <div
                  key={demo.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-gray-100 bg-gray-50 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <span className="truncate text-sm font-medium text-gray-900">{demo.prospect_name}</span>
                    <span className="ml-2 text-xs text-gray-500">{typeLabel}</span>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${badge.className}`}>
                    {badge.label}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete demo for ${demo.prospect_name}`}
                    className="shrink-0 rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    onClick={() => setDemoToDelete(demo)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {demoToDelete && (
        <ConfirmDialog
          title="Delete Demo?"
          message={
            <>
              <p>
                This will permanently delete the seeded demo workspace for{' '}
                <span className="font-medium">{demoToDelete.prospect_name}</span>.
              </p>
              <p className="mt-2">
                The demo community, seeded data, and demo user accounts will be removed.
              </p>
            </>
          }
          confirmLabel={isDeletingDemo ? 'Deleting...' : 'Delete Demo'}
          confirmVariant="danger"
          isPending={isDeletingDemo}
          onConfirm={handleDeleteDemo}
          onCancel={() => setDemoToDelete(null)}
        />
      )}

      {/* Controls */}
      <div className="flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="search"
            placeholder="Search by name…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* Type filter */}
        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="appearance-none rounded-md border border-gray-300 py-1.5 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All types</option>
            <option value="condo_718">Condo §718</option>
            <option value="hoa_720">HOA §720</option>
            <option value="apartment">Apartment</option>
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as typeof sort)}
            className="appearance-none rounded-md border border-gray-300 py-1.5 pl-3 pr-8 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="name-asc">Name (A–Z)</option>
            <option value="name-desc">Name (Z–A)</option>
            <option value="created-desc">Newest first</option>
            <option value="created-asc">Oldest first</option>
          </select>
          <ChevronDown size={14} className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Community grid */}
      {filtered.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-16 text-center">
          <p className="text-sm text-gray-500">No communities match your filters.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {paginated.map((c) => {
              const type = COMMUNITY_TYPE_LABELS[c.community_type] ?? COMMUNITY_TYPE_LABELS.condo_718!;
              const status = SUBSCRIPTION_STATUS_LABELS[c.subscription_status ?? ''];
              return (
                <Link
                  key={c.id}
                  href={`/clients/${c.id}`}
                  className="flex flex-col rounded-lg border border-gray-200 bg-white p-5 shadow-e1 transition-shadow hover:shadow-e2"
                >
                  <div className="mb-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-gray-900" title={c.name}>{c.name}</p>
                      {(c.city || c.state) && (
                        <p className="mt-0.5 text-xs text-gray-500">
                          {[c.city, c.state].filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${type.className}`}>
                      {type.label}
                    </span>
                  </div>

                  <div className="mt-auto flex items-center justify-between pt-3 border-t border-gray-100">
                    {status ? (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
                        {status.label}
                      </span>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
                    <span className="text-xs text-gray-400">
                      {format(new Date(c.created_at), 'MMM d, yyyy')}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 1}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-xs text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={page === totalPages}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
