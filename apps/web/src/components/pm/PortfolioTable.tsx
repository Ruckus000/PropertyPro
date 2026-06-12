'use client';

import type { OnChangeFn, PaginationState, RowSelectionState, SortingState } from '@tanstack/react-table';
import { DataTable } from '@/components/shared/data-table';
import { portfolioColumns } from './portfolio-columns';
import type { PortfolioCommunity } from '@/hooks/use-portfolio-dashboard';

interface PortfolioTableProps {
  data: PortfolioCommunity[];
  totalCount: number;
  isLoading: boolean;
  pagination: PaginationState;
  onPaginationChange: (updater: PaginationState | ((old: PaginationState) => PaginationState)) => void;
  sorting: SortingState;
  onSortingChange: (updater: SortingState | ((old: SortingState) => SortingState)) => void;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
}

export function PortfolioTable({
  data,
  totalCount,
  isLoading,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
  rowSelection,
  onRowSelectionChange,
}: PortfolioTableProps) {
  const pageCount = Math.ceil(totalCount / pagination.pageSize);

  return (
    <DataTable
      columns={portfolioColumns}
      data={data}
      pageCount={pageCount}
      pagination={pagination}
      onPaginationChange={onPaginationChange}
      sorting={sorting}
      onSortingChange={onSortingChange}
      rowSelection={rowSelection}
      onRowSelectionChange={onRowSelectionChange}
      getRowId={(row) => String(row.communityId)}
      isLoading={isLoading}
      emptyMessage="No communities found."
    />
  );
}
