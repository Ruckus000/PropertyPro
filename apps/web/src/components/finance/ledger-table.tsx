'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/shared/data-table';
import { CsvExportButton } from '@/components/shared/csv-export-button';
import { useLedger, type LedgerEntry, type LedgerFilters } from '@/hooks/use-finance';
import { cn } from '@/lib/utils';

/* ─────── Helpers ─────── */

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const ENTRY_TYPE_BADGE_CLASSES: Record<string, string> = {
  assessment: 'bg-blue-100 text-blue-800 border-blue-200',
  payment: 'bg-green-100 text-green-800 border-green-200',
  refund: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  fine: 'bg-red-100 text-red-800 border-red-200',
  fee: 'bg-orange-100 text-orange-800 border-orange-200',
  adjustment: 'bg-gray-100 text-gray-800 border-gray-200',
};

const ENTRY_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'assessment', label: 'Assessments' },
  { value: 'payment', label: 'Payments' },
  { value: 'refund', label: 'Refunds' },
  { value: 'fine', label: 'Fines' },
  { value: 'fee', label: 'Fees' },
  { value: 'adjustment', label: 'Adjustments' },
];

/* ─────── Columns ─────── */

const columns: ColumnDef<LedgerEntry, unknown>[] = [
  {
    accessorKey: 'createdAt',
    header: 'Date',
    cell: ({ row }) => (
      <span className="whitespace-nowrap text-sm text-muted-foreground">
        {formatDate(row.original.createdAt)}
      </span>
    ),
  },
  {
    accessorKey: 'entryType',
    header: 'Type',
    cell: ({ row }) => {
      const type = row.original.entryType;
      return (
        <Badge
          variant="outline"
          className={cn(
            'capitalize',
            ENTRY_TYPE_BADGE_CLASSES[type] ?? 'bg-gray-100 text-gray-600',
          )}
        >
          {type}
        </Badge>
      );
    },
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ row }) => (
      <span className="block max-w-xs truncate text-sm">
        {row.original.description}
      </span>
    ),
  },
  {
    accessorKey: 'unitId',
    header: 'Unit',
    cell: ({ row }) => (
      <span className="text-sm text-muted-foreground">
        {row.original.unitLabel
          ? row.original.unitLabel
          : row.original.unitId
            ? `Unit #${row.original.unitId}`
            : '-'}
      </span>
    ),
  },
  {
    accessorKey: 'amountCents',
    header: () => <div className="text-right">Amount</div>,
    cell: ({ row }) => {
      const cents = row.original.amountCents;
      const isPositive = cents >= 0;
      return (
        <div
          className={cn(
            'text-right text-sm font-medium',
            isPositive ? 'text-red-600' : 'text-green-600',
          )}
        >
          {isPositive ? '+' : ''}
          {formatCents(Math.abs(cents))}
        </div>
      );
    },
  },
];

/* ─────── Component ─────── */

interface LedgerTableProps {
  communityId: number;
}

export function LedgerTable({ communityId }: LedgerTableProps) {
  const [entryType, setEntryType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filters: LedgerFilters = useMemo(
    () => ({
      entryType: entryType || undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    }),
    [entryType, startDate, endDate],
  );

  const { data: entries, isLoading } = useLedger(communityId, filters);

  // Build CSV export rows
  const csvRows = useMemo(
    () =>
      (entries ?? []).map((e) => ({
        Date: formatDate(e.createdAt),
        Type: e.entryType,
        Description: e.description,
        Unit: e.unitLabel ?? (e.unitId ? `Unit #${e.unitId}` : ''),
        Amount: formatCents(e.amountCents),
      })),
    [entries],
  );

  return (
    <div className="space-y-4">
      {/* Filters + Export */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={entryType}
          onChange={(e) => setEntryType(e.target.value)}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          {ENTRY_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          aria-label="Start date"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />
        <span className="text-sm text-muted-foreground">to</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          aria-label="End date"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        />

        <div className="ml-auto">
          <CsvExportButton
            headers={['Date', 'Type', 'Description', 'Unit', 'Amount']}
            rows={csvRows}
            filename={`ledger-${communityId}`}
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={entries ?? []}
        isLoading={isLoading}
        emptyMessage="No ledger entries found."
      />
    </div>
  );
}
