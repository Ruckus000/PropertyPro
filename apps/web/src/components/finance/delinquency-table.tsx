'use client';

import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Badge } from '@/components/ui/badge';
import { DataTable } from '@/components/shared/data-table';
import {
  useDelinquency,
  useWaiveLateFees,
  type DelinquentUnit,
} from '@/hooks/use-finance';
import { cn } from '@/lib/utils';

/* ─────── Helpers ─────── */

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100);
}

/* ─────── Component ─────── */

interface DelinquencyTableProps {
  communityId: number;
}

export function DelinquencyTable({ communityId }: DelinquencyTableProps) {
  const { data: rawUnits, isLoading } = useDelinquency(communityId);
  const waiveMutation = useWaiveLateFees(communityId);
  const [confirmUnitId, setConfirmUnitId] = useState<number | null>(null);
  const [errorUnitId, setErrorUnitId] = useState<number | null>(null);

  const units = useMemo(
    () =>
      [...(rawUnits ?? [])].sort(
        (a, b) => b.overdueAmountCents - a.overdueAmountCents,
      ),
    [rawUnits],
  );

  const columns = useMemo<ColumnDef<DelinquentUnit, unknown>[]>(
    () => [
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
        header: 'Overdue',
        cell: ({ row }) => (
          <span className="text-sm font-medium">
            {formatCents(row.original.overdueAmountCents)}
          </span>
        ),
      },
      {
        accessorKey: 'daysOverdue',
        header: 'Days overdue',
        cell: ({ row }) => (
          <span className="text-sm">{row.original.daysOverdue}</span>
        ),
      },
      {
        accessorKey: 'lienEligible',
        header: 'Lien eligible',
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
        cell: ({ row }) => {
          const unitId = row.original.unitId;
          const isConfirming = confirmUnitId === unitId;

          return (
            <div className="flex items-center justify-end gap-2">
              {errorUnitId === unitId && !isConfirming && (
                <span role="alert" className="text-xs text-status-danger">
                  Couldn&apos;t waive. Try again.
                </span>
              )}
              {isConfirming ? (
                <>
                  <button
                    type="button"
                    disabled={waiveMutation.isPending}
                    onClick={() => {
                      waiveMutation.mutate(unitId, {
                        onSuccess: () => {
                          setErrorUnitId(null);
                          setConfirmUnitId(null);
                        },
                        onError: () => {
                          setErrorUnitId(unitId);
                          setConfirmUnitId(null);
                        },
                      });
                    }}
                    className="rounded-md bg-interactive-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-interactive-primary-hover disabled:opacity-50"
                  >
                    Confirm waive
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmUnitId(null)}
                    className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={waiveMutation.isPending}
                  onClick={() => {
                    setErrorUnitId(null);
                    setConfirmUnitId(unitId);
                  }}
                  className={cn(
                    'rounded-md border border-input bg-background px-2.5 py-1 text-xs font-medium',
                    'hover:bg-accent hover:text-accent-foreground disabled:opacity-50',
                  )}
                >
                  Waive Late Fees
                </button>
              )}
            </div>
          );
        },
      },
    ],
    [confirmUnitId, errorUnitId, waiveMutation],
  );

  if (!isLoading && units.length === 0) {
    return (
      <div className="rounded-md border border-status-success-border bg-status-success-bg p-8 text-center">
        <svg
          className="mx-auto h-10 w-10 text-status-success"
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
        <p className="mt-2 text-sm font-medium text-status-success">No delinquent units</p>
        <p className="text-sm text-status-success">
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
