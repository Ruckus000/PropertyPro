'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PaginationState, RowSelectionState, SortingState } from '@tanstack/react-table';
import type { CommunityType } from '@propertypro/shared';
import { usePortfolioDashboard } from '@/hooks/use-portfolio-dashboard';
import { useBillingGroup } from '@/hooks/use-billing-group';
import { AlertBanner } from '@/components/shared/alert-banner';
import { PageHeader } from '@/components/shared/page-header';
import { CommunityFilters } from './CommunityFilters';
import { KpiSummaryBar } from './KpiSummaryBar';
import { CommunityCardGrid } from './CommunityCardGrid';
import { PortfolioTable } from './PortfolioTable';
import { ViewToggle, getStoredViewMode, storeViewMode, type ViewMode } from './ViewToggle';
import { AddCommunityModal } from './add-community-modal';
import { CommunityAddedModal } from './CommunityAddedModal';
import { SiteSetupBanner } from './SiteSetupBanner';
import { BulkAnnouncementDialog } from './BulkAnnouncementDialog';
import { BulkDocumentDialog } from './BulkDocumentDialog';

const VALID_TYPES = new Set(['condo_718', 'hoa_720', 'apartment']);

export function PmDashboardClient() {
  const searchParams = useSearchParams();

  const rawType = searchParams.get('communityType') ?? undefined;
  const communityType =
    rawType && VALID_TYPES.has(rawType) ? (rawType as CommunityType) : undefined;
  const search = searchParams.get('search') ?? undefined;

  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [selectedCommunityMeta, setSelectedCommunityMeta] = useState<
    Record<string, { id: number; name: string }>
  >({});
  const [bulkAnnouncementOpen, setBulkAnnouncementOpen] = useState(false);
  const [bulkDocumentOpen, setBulkDocumentOpen] = useState(false);

  const billingGroupQuery = useBillingGroup();
  const billingGroupId = billingGroupQuery.data?.data.billingGroupId ?? null;

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });
  const [sorting, setSorting] = useState<SortingState>([]);

  useEffect(() => {
    setViewMode(getStoredViewMode());
  }, []);

  function handleViewChange(mode: ViewMode) {
    setViewMode(mode);
    storeViewMode(mode);
  }

  const { data, isLoading, isError } = usePortfolioDashboard({
    communityType,
    search,
    sortBy: sorting[0]?.id,
    sortDir: sorting[0]?.desc ? 'desc' : sorting[0] ? 'asc' : undefined,
    limit: pagination.pageSize,
    offset: pagination.pageIndex * pagination.pageSize,
  });

  // Keep stable community id/name for bulk actions across pagination and sort.
  useEffect(() => {
    const communities = data?.communities ?? [];
    setSelectedCommunityMeta((prev) => {
      const next = { ...prev };
      for (const community of communities) {
        const key = String(community.communityId);
        if (rowSelection[key]) {
          next[key] = { id: community.communityId, name: community.communityName };
        }
      }
      for (const key of Object.keys(next)) {
        if (!rowSelection[key]) {
          delete next[key];
        }
      }
      return next;
    });
  }, [data?.communities, rowSelection]);

  // Soft nudge when any loaded community hasn't completed its public site.
  // (Scoped to the current page of results — acceptable for a dismissible
  // nudge; the vast majority of portfolios fit on one page.)
  const hasIncompleteSite = (data?.communities ?? []).some(
    (c) => c.siteOnboardingCompletedAt === null,
  );

  const selectedCommunities = useMemo(
    () => Object.values(selectedCommunityMeta),
    [selectedCommunityMeta],
  );

  return (
    <div className="space-y-6">
      <SiteSetupBanner hasIncompleteSite={hasIncompleteSite} />
      <PageHeader
        title="Communities"
        description={
          isLoading
            ? 'Loading...'
            : `${data?.totalCount ?? 0} ${(data?.totalCount ?? 0) === 1 ? 'community' : 'communities'} in your portfolio`
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {viewMode === 'list' && selectedCommunities.length > 0 && (
              <>
                <Button variant="outline" size="sm" onClick={() => setBulkAnnouncementOpen(true)}>
                  Bulk announcement ({selectedCommunities.length})
                </Button>
                <Button variant="outline" size="sm" onClick={() => setBulkDocumentOpen(true)}>
                  Bulk documents ({selectedCommunities.length})
                </Button>
              </>
            )}
            <CommunityFilters />
            <ViewToggle value={viewMode} onChange={handleViewChange} />
            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              disabled={!billingGroupId}
              className="inline-flex items-center gap-1.5 rounded-md bg-interactive-primary px-3 py-2 text-sm font-semibold text-white hover:bg-interactive-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 disabled:opacity-50"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Community
            </button>
          </div>
        }
      />

      <KpiSummaryBar kpis={data?.kpis} isLoading={isLoading} />

      {isError && (
        <AlertBanner
          status="danger"
          title="Failed to load dashboard data"
          description="Please try again or contact support if the problem persists."
        />
      )}

      {billingGroupQuery.isError && (
        <AlertBanner
          status="warning"
          title="Portfolio billing needs attention"
          description={billingGroupQuery.error.message}
        />
      )}

      {viewMode === 'cards' ? (
        <CommunityCardGrid
          communities={data?.communities ?? []}
          isLoading={isLoading}
        />
      ) : (
        <PortfolioTable
          data={data?.communities ?? []}
          totalCount={data?.totalCount ?? 0}
          isLoading={isLoading}
          pagination={pagination}
          onPaginationChange={setPagination}
          sorting={sorting}
          onSortingChange={setSorting}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
        />
      )}

      <AddCommunityModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        billingGroupId={billingGroupId}
      />

      {/* Confirmation shown when Stripe checkout returns after adding a community. */}
      <CommunityAddedModal />

      <BulkAnnouncementDialog
        selectedCommunities={selectedCommunities}
        open={bulkAnnouncementOpen}
        onClose={() => {
          setBulkAnnouncementOpen(false);
          setRowSelection({});
          setSelectedCommunityMeta({});
        }}
      />
      <BulkDocumentDialog
        selectedCommunities={selectedCommunities}
        open={bulkDocumentOpen}
        onClose={() => {
          setBulkDocumentOpen(false);
          setRowSelection({});
          setSelectedCommunityMeta({});
        }}
      />
    </div>
  );
}
