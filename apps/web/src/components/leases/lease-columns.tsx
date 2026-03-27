'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Plus } from 'lucide-react';
import type { EnrichedLeaseListItem, LeaseTableRow } from '@/hooks/use-leases';
import {
  formatRentDisplay,
  formatLeaseDate,
  getLeaseDisplayStatus,
  type LeaseDisplayStatus,
} from '@/lib/utils/lease-utils';
// Use @propertypro/ui Badge — it owns the CVA variant system for status colors.
// The shadcn Badge (apps/web/src/components/ui/badge.tsx) only has
// default/secondary/destructive/outline variants; pasting ad-hoc status color
// classes onto it bypasses CVA and breaks tailwind-merge conflict resolution.
import { Badge, type BadgeVariant } from '@propertypro/ui';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ---------------------------------------------------------------------------
// LeaseStatusBadge
// ---------------------------------------------------------------------------

const STATUS_TO_VARIANT: Record<LeaseDisplayStatus | 'vacant', BadgeVariant> = {
  active: 'success',
  expiring_soon: 'warning',
  expired: 'danger',
  renewed: 'neutral',
  terminated: 'neutral',
  vacant: 'neutral',
};

const STATUS_LABELS: Record<LeaseDisplayStatus | 'vacant', string> = {
  active: 'Active',
  expiring_soon: 'Expiring Soon',
  expired: 'Expired',
  renewed: 'Renewed',
  terminated: 'Terminated',
  vacant: 'Vacant',
};

function LeaseStatusBadge({ status }: { status: LeaseDisplayStatus | 'vacant' }) {
  return (
    <Badge variant={STATUS_TO_VARIANT[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Column actions
// ---------------------------------------------------------------------------

export interface LeaseColumnActions {
  onView: (lease: EnrichedLeaseListItem) => void;
  onEdit: (lease: EnrichedLeaseListItem) => void;
  onRenew: (lease: EnrichedLeaseListItem) => void;
  onTerminate: (lease: EnrichedLeaseListItem) => void;
  onCreateLease?: (unitId: number) => void; // for vacant rows
}

// ---------------------------------------------------------------------------
// Column factory
// ---------------------------------------------------------------------------

export function getLeaseColumns(
  actions: LeaseColumnActions,
  referenceDate: Date,
): ColumnDef<LeaseTableRow, unknown>[] {
  return [
    {
      id: 'unit',
      header: 'Unit',
      cell: ({ row }) => {
        if (row.original.kind === 'vacant') {
          return <span className="font-medium">{row.original.unitNumber}</span>;
        }
        const { lease } = row.original;
        return (
          <span className="font-medium">
            {lease.unitNumber ?? `Unit ${lease.unitId}`}
          </span>
        );
      },
    },
    {
      id: 'resident',
      header: 'Resident',
      cell: ({ row }) => {
        if (row.original.kind === 'vacant') {
          return <span className="text-sm text-muted-foreground">—</span>;
        }
        const { lease } = row.original;
        return (
          <span className="text-sm">
            {lease.residentName ?? '—'}
          </span>
        );
      },
    },
    {
      id: 'startDate',
      header: 'Start Date',
      cell: ({ row }) => {
        if (row.original.kind === 'vacant') return '—';
        return formatLeaseDate(row.original.lease.startDate);
      },
    },
    {
      id: 'endDate',
      header: 'End Date',
      cell: ({ row }) => {
        if (row.original.kind === 'vacant') return '—';
        return formatLeaseDate(row.original.lease.endDate);
      },
    },
    {
      id: 'rentAmount',
      header: () => <div className="text-right">Monthly Rent</div>,
      cell: ({ row }) => {
        if (row.original.kind === 'vacant') {
          return <div className="text-right text-muted-foreground">—</div>;
        }
        return (
          <div className="text-right">
            {formatRentDisplay(row.original.lease.rentAmount)}
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        if (row.original.kind === 'vacant') {
          return <LeaseStatusBadge status="vacant" />;
        }
        const displayStatus = getLeaseDisplayStatus(row.original.lease, referenceDate);
        return <LeaseStatusBadge status={displayStatus} />;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        // Vacant row: only show "Create Lease" action
        if (row.original.kind === 'vacant') {
          const { unitId } = row.original;
          return (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => actions.onCreateLease?.(unitId)}
              className="h-8 text-xs"
            >
              <Plus className="mr-1 h-3 w-3" aria-hidden="true" />
              Create Lease
            </Button>
          );
        }

        const { lease } = row.original;
        const displayStatus = getLeaseDisplayStatus(lease, referenceDate);
        // canRenew requires both active/expiring status AND a fixed end date.
        // Month-to-month leases have no endDate — the API rejects renewals without one.
        const canRenew =
          (displayStatus === 'active' || displayStatus === 'expiring_soon') &&
          !!lease.endDate;
        const canTerminate =
          displayStatus === 'active' || displayStatus === 'expiring_soon';

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                <span className="sr-only">Open menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => actions.onView(lease)}>
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => actions.onEdit(lease)}>
                Edit
              </DropdownMenuItem>
              {canRenew && (
                <DropdownMenuItem onClick={() => actions.onRenew(lease)}>
                  Renew
                </DropdownMenuItem>
              )}
              {canTerminate && (
                <DropdownMenuItem
                  onClick={() => actions.onTerminate(lease)}
                  className="text-destructive"
                >
                  Terminate
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ] satisfies ColumnDef<LeaseTableRow, unknown>[];
}
