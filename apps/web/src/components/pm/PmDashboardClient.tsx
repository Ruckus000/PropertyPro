'use client';

/**
 * The Communities page (`/pm/dashboard/communities`).
 *
 * Its layout follows the size of the whole portfolio (see
 * lib/pm/communities-page.ts): a chooser for one or two communities, a site
 * gallery up to eight, a grouped list up to 24, a dense table beyond. Cards or
 * list is the user's call at every size; the size only picks the default.
 *
 * Search, type and saved view live in the URL so a filtered page can be
 * shared and survives a reload. Sort, page and selection are local.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Building2, CheckCircle2, SearchX } from 'lucide-react';
import { COMMUNITY_TYPES, type CommunityType } from '@propertypro/shared';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertBanner } from '@/components/shared/alert-banner';
import { EmptyState } from '@/components/shared/empty-state';
import { PageHeader } from '@/components/shared/page-header';
import { usePortfolioDashboard, type PortfolioCommunity } from '@/hooks/use-portfolio-dashboard';
import { useAddCommunityAccess } from '@/hooks/use-add-community';
import { cn } from '@/lib/utils';
import { PORTFOLIO_VIEWS, type PortfolioView } from '@/lib/pm/portfolio-summary-keys';
import { defaultViewMode, pickTier, typeLabel } from '@/lib/pm/communities-page';
import { getStoredViewMode, storeViewMode, type ViewMode } from './ViewToggle';
import { AddCommunityModal } from './add-community-modal';
import { CommunityAddedModal } from './CommunityAddedModal';
import { SiteSetupBanner } from './SiteSetupBanner';
import { BulkAnnouncementDialog } from './BulkAnnouncementDialog';
import { CommunitiesToolbar, SORT_OPTIONS } from './communities/CommunitiesToolbar';
import { CommunityChooser, CommunityGallery } from './communities/CommunityCards';
import { CommunityTable, type CommunitySort } from './communities/CommunityTable';
import { BulkActionBar } from './communities/BulkActionBar';

// Loaded on demand: it closes by default, and its upload rules and redaction
// field would otherwise put the dashboard over the web JS budget (perf-check).
const BulkDocumentDialog = dynamic(() => import('./BulkDocumentDialog').then((m) => m.BulkDocumentDialog), {
  loading: () => null,
});

/**
 * One page holds every community up to 100, the summary's largest page.
 * ponytail: past 100 the dense table pages and its totals row hides, since it
 * would only add up the page on screen. Trigger: a customer with more than
 * 100 communities.
 */
const PAGE_SIZE = 100;
const DEFAULT_SORT: CommunitySort = { key: 'status', dir: 'asc' };

function parseType(raw: string | null): CommunityType | null {
  return raw && (COMMUNITY_TYPES as readonly string[]).includes(raw) ? (raw as CommunityType) : null;
}

function parseView(raw: string | null): PortfolioView | null {
  return raw && (PORTFOLIO_VIEWS as readonly string[]).includes(raw) ? (raw as PortfolioView) : null;
}

export interface PmDashboardClientProps {
  /** The actor's plan includes portfolio templates (server-checked). */
  showTemplates?: boolean;
}

function LoadingState() {
  return (
    <div role="status" className="space-y-6">
      <span className="sr-only">Loading communities</span>
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-8 w-48" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-md" />
        ))}
      </div>
    </div>
  );
}

export function PmDashboardClient({ showTemplates = false }: PmDashboardClientProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const communityType = parseType(searchParams.get('communityType'));
  const search = searchParams.get('search')?.trim() ?? '';
  const view = parseView(searchParams.get('view'));

  // Read after mount: the server has no storage, and both renders must match.
  const [chosenMode, setChosenMode] = useState<ViewMode | null>(null);
  useEffect(() => {
    setChosenMode(getStoredViewMode());
  }, []);

  const [sort, setSort] = useState<CommunitySort>(DEFAULT_SORT);
  // The page belongs to one set of filters and one sort: change either and it
  // is page 1 in the same render, so no request goes out with the old offset.
  const pageKey = [communityType, search, view, sort.key, sort.dir].join('|');
  const [pageState, setPageState] = useState({ key: pageKey, page: 0 });
  const page = pageState.key === pageKey ? pageState.page : 0;
  const setPage = (next: number) => setPageState({ key: pageKey, page: next });
  const [selected, setSelected] = useState<ReadonlyMap<number, string>>(new Map());
  const [selecting, setSelecting] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [bulkAnnouncementOpen, setBulkAnnouncementOpen] = useState(false);
  const [bulkDocumentOpen, setBulkDocumentOpen] = useState(false);

  // Add Community is the portfolio billing owner's, while root in it.
  const addAccess = useAddCommunityAccess();

  // A bulk send must only reach communities the user can see, so a new search,
  // type or view starts the selection over.
  const filterKey = [communityType, search, view].join('|');
  useEffect(() => {
    setSelected((prev) => (prev.size === 0 ? prev : new Map()));
  }, [filterKey]);

  const { data, isLoading, isError, refetch } = usePortfolioDashboard({
    communityType: communityType ?? undefined,
    search: search || undefined,
    view: view ?? undefined,
    sortBy: sort.key,
    sortDir: sort.dir,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  });

  const tier = data ? pickTier(data.portfolioCount) : null;
  const viewMode: ViewMode = chosenMode ?? (tier ? defaultViewMode(tier) : 'cards');

  const updateParams = useCallback(
    (changes: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const clearSelection = useCallback(() => {
    setSelected(new Map());
    setSelecting(false);
  }, []);

  function handleViewModeChange(mode: ViewMode) {
    setChosenMode(mode);
    storeViewMode(mode);
    // Cards and the grouped list have no sort headers to show a column sort.
    setSort(DEFAULT_SORT);
    if (mode === 'cards') clearSelection();
  }

  function toggleOne(c: PortfolioCommunity, checked: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      if (checked) next.set(c.communityId, c.communityName);
      else next.delete(c.communityId);
      return next;
    });
  }

  function toggleAll(rows: PortfolioCommunity[], checked: boolean) {
    setSelected((prev) => {
      const next = new Map(prev);
      for (const c of rows) {
        if (checked) next.set(c.communityId, c.communityName);
        else next.delete(c.communityId);
      }
      return next;
    });
  }

  const selectedCommunities = useMemo(
    () => Array.from(selected, ([id, name]) => ({ id, name })),
    [selected],
  );

  // Soft nudge when any loaded community hasn't completed its public site.
  const incompleteSiteCommunities = (data?.communities ?? []).filter((c) => c.siteOnboardingCompletedAt === null);
  const firstIncompleteSiteCommunity = incompleteSiteCommunities[0];
  const incompleteSitesAllPublished = incompleteSiteCommunities.every((c) => c.sitePublishedAt != null);

  const filtered = Boolean(communityType || search || view);
  const showBulkBar = viewMode === 'list' && selected.size > 0;
  const openAdd = addAccess.data?.allowed ? () => setIsAddModalOpen(true) : undefined;

  function renderEmpty() {
    if (!data) return null;
    if (data.portfolioCount === 0) {
      return (
        <EmptyState
          icon={Building2}
          title="Add your first community"
          description="Set up a community to start managing documents, compliance and residents."
          action={openAdd && <Button onClick={openAdd}>Add Community</Button>}
        />
      );
    }
    if (search || communityType) {
      const typeName = communityType ? typeLabel(communityType) : null;
      const cleared = [search && 'the search', typeName && `the ${typeName} filter`].filter(Boolean).join(' and ');
      return (
        <EmptyState
          icon={SearchX}
          title={search ? `No communities match "${search}"` : `No ${typeName} communities`}
          description={`${search ? 'Check the spelling, or clear' : 'Clear'} ${cleared} to see all ${data.portfolioCount}.`}
          action={
            <Button variant="outline" onClick={() => updateParams({ search: null, communityType: null, view: null })}>
              Clear search and filters
            </Button>
          }
        />
      );
    }
    return (
      <EmptyState
        icon={CheckCircle2}
        title={view === 'overdue_dues' ? 'No overdue dues' : 'Nothing needs attention'}
        description={
          view === 'overdue_dues'
            ? 'No community has dues past due.'
            : 'No community has a document past its deadline or overdue dues.'
        }
        action={
          <Button variant="outline" onClick={() => updateParams({ view: null })}>
            Show all communities
          </Button>
        }
      />
    );
  }

  function renderCommunities() {
    if (!data || !tier) return null;
    const rows = data.communities;
    if (rows.length === 0) return renderEmpty();
    if (viewMode === 'cards') {
      return tier === 'chooser' ? (
        <CommunityChooser communities={rows} />
      ) : (
        <CommunityGallery
          communities={rows}
          showAddTile={!filtered && data.totalCount === rows.length}
          onAdd={openAdd}
        />
      );
    }
    return (
      <CommunityTable
        variant={tier === 'dense' ? 'dense' : 'grouped'}
        rows={rows}
        selected={new Set(selected.keys())}
        onToggle={toggleOne}
        onToggleAll={toggleAll}
        selecting={selecting}
        sort={sort}
        onSortChange={setSort}
        showTotals={data.totalCount === rows.length}
      />
    );
  }

  const from = page * PAGE_SIZE + 1;
  const to = data ? Math.min(data.totalCount, from + data.communities.length - 1) : 0;

  return (
    <div className={cn('space-y-6', showBulkBar && 'pb-24')}>
      <SiteSetupBanner
        hasIncompleteSite={firstIncompleteSiteCommunity !== undefined}
        firstIncompleteCommunityId={firstIncompleteSiteCommunity?.communityId ?? null}
        allSitesPublished={incompleteSitesAllPublished}
      />
      {/* The toolbar below leads with the count; the title is for the breadcrumb and screen readers. */}
      <PageHeader title="Communities" hideHelpButton />

      {isLoading && !data ? (
        <LoadingState />
      ) : !data || !tier ? (
        <AlertBanner
          status="danger"
          title="We couldn't load your communities."
          description="Check your connection, then try again."
          action={
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          }
        />
      ) : (
        <>
          <CommunitiesToolbar
            tier={tier}
            portfolioCount={data.portfolioCount}
            totalUnits={communityType ? null : data.kpis.totalUnits.value}
            viewCounts={data.viewCounts}
            view={view}
            onViewChange={(v) => updateParams({ view: v })}
            search={search}
            onSearchChange={(s) => updateParams({ search: s || null })}
            communityType={communityType}
            onTypeChange={(t) => updateParams({ communityType: t })}
            sortId={SORT_OPTIONS.find((o) => o.sort.key === sort.key && o.sort.dir === sort.dir)?.id ?? null}
            onSortChange={setSort}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
            showTemplates={showTemplates}
            onSelectCommunities={() => {
              if (viewMode !== 'list') handleViewModeChange('list');
              setSelecting(true);
            }}
            onAdd={openAdd}
          />

          {isError && (
            <AlertBanner
              status="danger"
              title="We couldn't refresh your communities."
              description="What you see may be out of date. Try again in a moment."
            />
          )}

          {renderCommunities()}

          {data.totalCount > PAGE_SIZE && (
            <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-sm text-content-secondary">
              <p>
                Showing {from}–{to} of {data.totalCount}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={to >= data.totalCount}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            </nav>
          )}
        </>
      )}

      {showBulkBar && (
        <BulkActionBar
          count={selected.size}
          onAnnouncement={() => setBulkAnnouncementOpen(true)}
          onDocuments={() => setBulkDocumentOpen(true)}
          onClear={clearSelection}
        />
      )}

      {openAdd && <AddCommunityModal open={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />}

      {/* Confirmation shown when Stripe checkout returns after adding a community. */}
      <CommunityAddedModal />

      <BulkAnnouncementDialog
        selectedCommunities={selectedCommunities}
        open={bulkAnnouncementOpen}
        onClose={() => {
          setBulkAnnouncementOpen(false);
          clearSelection();
        }}
      />
      <BulkDocumentDialog
        selectedCommunities={selectedCommunities}
        open={bulkDocumentOpen}
        onClose={() => {
          setBulkDocumentOpen(false);
          clearSelection();
        }}
      />
    </div>
  );
}
