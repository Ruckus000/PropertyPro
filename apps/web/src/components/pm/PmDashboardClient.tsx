'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import type { PaginationState, SortingState } from '@tanstack/react-table';
import type { CommunityType } from '@propertypro/shared';
import { usePortfolioDashboard } from '@/hooks/use-portfolio-dashboard';
import { CommunityFilters } from './CommunityFilters';
import { PortfolioKpiRow } from './PortfolioKpiRow';
import { PortfolioTable } from './PortfolioTable';

const VALID_TYPES = new Set(['condo_718', 'hoa_720', 'apartment']);

export function PmDashboardClient() {
  const searchParams = useSearchParams();

  const rawType = searchParams.get('communityType') ?? undefined;
  const communityType =
    rawType && VALID_TYPES.has(rawType) ? (rawType as CommunityType) : undefined;
  const search = searchParams.get('search') ?? undefined;

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 20,
  });

  const [sorting, setSorting] = useState<SortingState>([]);

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
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Portfolio Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500">
            {isLoading
              ? 'Loading...'
              : `${data?.totalCount ?? 0} ${(data?.totalCount ?? 0) === 1 ? 'community' : 'communities'}`}
          </p>
        </div>
        <CommunityFilters />
      </div>

      {/* KPI Row */}
      <PortfolioKpiRow kpis={data?.kpis} isLoading={isLoading} />

      {/* Error Banner */}
      {isError && (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          Failed to load dashboard data. Please try again.
        </div>
      )}

      {/* Portfolio Table */}
      <PortfolioTable
        data={data?.communities ?? []}
        totalCount={data?.totalCount ?? 0}
        isLoading={isLoading}
        pagination={pagination}
        onPaginationChange={setPagination}
        sorting={sorting}
        onSortingChange={setSorting}
      />
    </div>
  );
}
