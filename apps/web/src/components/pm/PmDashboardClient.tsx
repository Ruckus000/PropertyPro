'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import type { PaginationState, SortingState } from '@tanstack/react-table';
import type { CommunityType } from '@propertypro/shared';
import { usePortfolioDashboard } from '@/hooks/use-portfolio-dashboard';
import { AlertBanner } from '@/components/shared/alert-banner';
import { PageHeader } from '@/components/shared/page-header';
import { CommunityFilters } from './CommunityFilters';
import { KpiSummaryBar } from './KpiSummaryBar';
import { CommunityCardGrid } from './CommunityCardGrid';
import { PortfolioTable } from './PortfolioTable';
import { ViewToggle, getStoredViewMode, storeViewMode, type ViewMode } from './ViewToggle';
import { AddCommunityModal } from './add-community-modal';

const VALID_TYPES = new Set(['condo_718', 'hoa_720', 'apartment']);

async function fetchBillingGroup(): Promise<{ data: { billingGroupId: number } }> {
  const res = await fetch('/api/v1/billing-groups/mine');
  if (!res.ok) {
    let message = 'Failed to fetch billing group';
    try {
      const body = await res.json() as { error?: { message?: string } };
      if (body.error?.message) {
        message = body.error.message;
      }
    } catch {
      // Ignore parse failures and use the generic fallback above.
    }
    throw new Error(message);
  }

  return res.json();
}

export function PmDashboardClient() {
  const searchParams = useSearchParams();

  const rawType = searchParams.get('communityType') ?? undefined;
  const communityType =
    rawType && VALID_TYPES.has(rawType) ? (rawType as CommunityType) : undefined;
  const search = searchParams.get('search') ?? undefined;

  const [viewMode, setViewMode] = useState<ViewMode>('cards');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const billingGroupQuery = useQuery<{ data: { billingGroupId: number } }, Error>({
    queryKey: ['billing-group', 'mine'],
    queryFn: fetchBillingGroup,
  });
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Communities"
        description={
          isLoading
            ? 'Loading...'
            : `${data?.totalCount ?? 0} ${(data?.totalCount ?? 0) === 1 ? 'community' : 'communities'} in your portfolio`
        }
        actions={
          <div className="flex items-center gap-2">
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
        />
      )}

      <AddCommunityModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        billingGroupId={billingGroupId}
      />
    </div>
  );
}
