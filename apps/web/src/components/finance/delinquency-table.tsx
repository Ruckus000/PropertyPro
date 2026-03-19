'use client';

import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/shared/data-table';
import { useDelinquency, type DelinquentUnit } from '@/hooks/use-finance';
import { cn } from '@/lib/utils';

/* ─────── Helpers ─────── */

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/* ─────── Columns ─────── */

const columns: ColumnDef<DelinquentUnit, unknown>[] = [
  {
    accessorKey: 'unitId',
    header: 'Unit',
    cell: ({ row }) => (
      <span className="text-sm font-medium">
        {row.original.unitLabel ?? `Unit #${row.original.unitId}`}
      </span>
    ),
  },
  {
    accessorKey: 'ownerName',
    header: 'Owner / Resident',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.ownerName ?? '-'}
      </span>
    ),
  },
  {
    accessorKey: 'overdueAmountCents',
    header: () => <div className="text-right">Overdue Amount</div>,
    cell: ({ row }) => (
      <div className="text-right text-sm font-medium text-red-600">
        {formatCents(row.original.overdueAmountCents)}
      </div>
    ),
  },
  {
    accessorKey: 'daysOverdue',
    header: () => <div className="text-right">Days Overdue</div>,
    cell: ({ row }) => (
      <div className="text-right text-sm">{row.original.daysOverdue}</div>
    ),
  },
  {
    accessorKey: 'lineItemCount',
    header: () => <div className="text-right">Items Overdue</div>,
    cell: ({ row }) => (
      <div className="text-right text-sm text-muted-foreground">
        {row.original.lineItemCount}
      </div>
    ),
  },
  {
    accessorKey: 'lienEligible',
    header: 'Lien Eligible',
    cell: ({ row }) =>
      row.original.lienEligible ? (
        <Badge variant="destructive" className="text-xs">
          Yes
        </Badge>
      ) : (
        <span className="text-xs text-muted-foreground">No</span>
      ),
  },
  {
    id: 'actions',
    header: '',
    cell: () => (
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
        >
          Send Reminder
        </button>
        <button
          type="button"
          className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
        >
          Waive Late Fees
        </button>
      </div>
    ),
  },
];

/* ─────── Component ─────── */

interface DelinquencyTableProps {
  communityId: number;
}

export function DelinquencyTable({ communityId }: DelinquencyTableProps) {
  const { data: rawUnits, isLoading } = useDelinquency(communityId);

  // Sort by overdue amount descending
  const units = useMemo(
    () =>
      [...(rawUnits ?? [])].sort(
        (a, b) => b.overdueAmountCents - a.overdueAmountCents,
      ),
    [rawUnits],
  );

  if (!isLoading && units.length === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-8 text-center">
        <svg
          className="mx-auto h-10 w-10 text-green-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <p className="mt-2 text-sm font-medium text-green-900">No delinquent units</p>
        <p className="text-sm text-green-700">
          All units are current on their assessments.
        </p>
      </div>
    );
  }

  return (
    <DataTable
      columns={columns}
      data={units}
      isLoading={isLoading}
      emptyMessage="No delinquent units."
    />
  );
}
