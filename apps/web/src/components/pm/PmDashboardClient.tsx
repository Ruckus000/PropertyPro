'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
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

const VALID_TYPES = new Set(['condo_718', 'hoa_720', 'apartment']);

export function PmDashboardClient() {
  const searchParams = useSearchParams();

  const rawType = searchParams.get('communityType') ?? undefined;
  const communityType =
    rawType && VALID_TYPES.has(rawType) ? (rawType as CommunityType) : undefined;
  const search = searchParams.get('search') ?? undefined;

  const [viewMode, setViewMode] = useState<ViewMode>('cards');
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
            <Link
              href="/pm/dashboard/communities/new"
              className="inline-flex items-center gap-1.5 rounded-md bg-interactive-primary px-3 py-2 text-sm font-semibold text-white hover:bg-interactive-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add Community
            </Link>
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
    </div>
  );
}
