'use client';

import { useState, useCallback } from 'react';
import type { PaginationState, RowSelectionState, SortingState } from '@tanstack/react-table';
import { FileText, Megaphone } from 'lucide-react';
import { DataTable } from '@/components/shared/data-table';
import { BulkActionBar } from '@/components/shared/bulk-action-bar';
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
}

export function PortfolioTable({
  data,
  totalCount,
  isLoading,
  pagination,
  onPaginationChange,
  sorting,
  onSortingChange,
}: PortfolioTableProps) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  const selectedCount = Object.keys(rowSelection).filter(
    (key) => rowSelection[key],
  ).length;

  const clearSelection = useCallback(() => setRowSelection({}), []);

  const handleSendAnnouncement = useCallback(() => {
    const selectedIds = Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((key) => data[Number(key)]?.communityId)
      .filter(Boolean);
    // TODO: Open announcement modal with selectedIds
    console.log('Send announcement to:', selectedIds);
  }, [rowSelection, data]);

  const handleUploadDocument = useCallback(() => {
    const selectedIds = Object.keys(rowSelection)
      .filter((key) => rowSelection[key])
      .map((key) => data[Number(key)]?.communityId)
      .filter(Boolean);
    // TODO: Open upload modal with selectedIds
    console.log('Upload document to:', selectedIds);
  }, [rowSelection, data]);

  const pageCount = Math.ceil(totalCount / pagination.pageSize);

  return (
    <>
      <DataTable
        columns={portfolioColumns}
        data={data}
        pageCount={pageCount}
        pagination={pagination}
        onPaginationChange={onPaginationChange}
        sorting={sorting}
        onSortingChange={onSortingChange}
        isLoading={isLoading}
        emptyMessage="No communities found."
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
      />

      <BulkActionBar
        selectedCount={selectedCount}
        onClear={clearSelection}
        actions={[
          {
            label: 'Send Announcement',
            icon: Megaphone,
            onClick: handleSendAnnouncement,
          },
          {
            label: 'Upload Document',
            icon: FileText,
            onClick: handleUploadDocument,
          },
        ]}
      />
    </>
  );
}
