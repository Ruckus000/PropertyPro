'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { format, differenceInCalendarDays, parseISO } from 'date-fns';
import { MoreHorizontal } from 'lucide-react';
import type { LeaseListItem } from '@/hooks/use-leases';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string | null): string {
  if (!dateStr) return 'Month-to-month';
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy');
  } catch {
    return dateStr;
  }
}

function formatCurrency(cents: string | null): string {
  if (cents === null || cents === undefined) return '\u2014';
  const num = Number(cents);
  if (Number.isNaN(num)) return '\u2014';
  return (num / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

type LeaseStatus = 'active' | 'expiring_soon' | 'expired' | 'renewed' | 'terminated';

function getLeaseStatus(lease: LeaseListItem): LeaseStatus {
  if (lease.status === 'terminated') return 'terminated';
  if (lease.status === 'expired') return 'expired';
  if (lease.status === 'renewed') return 'renewed';

  if (lease.endDate) {
    const daysUntil = differenceInCalendarDays(parseISO(lease.endDate), new Date());
    if (daysUntil < 0) return 'expired';
    if (daysUntil <= 60) return 'expiring_soon';
  }

  return 'active';
}

function StatusBadge({ lease }: { lease: LeaseListItem }) {
  const status = getLeaseStatus(lease);

  switch (status) {
    case 'active':
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          Active
        </Badge>
      );
    case 'expiring_soon':
      return (
        <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
          Expiring Soon
        </Badge>
      );
    case 'expired':
      return (
        <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
          Expired
        </Badge>
      );
    case 'renewed':
      return (
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
          Renewed
        </Badge>
      );
    case 'terminated':
      return (
        <Badge className="bg-gray-100 text-gray-600 hover:bg-gray-100">
          Terminated
        </Badge>
      );
  }
}

// ---------------------------------------------------------------------------
// Column factory
// ---------------------------------------------------------------------------

export interface LeaseColumnActions {
  onView: (lease: LeaseListItem) => void;
  onEdit: (lease: LeaseListItem) => void;
  onRenew: (lease: LeaseListItem) => void;
  onTerminate: (lease: LeaseListItem) => void;
}

export function getLeaseColumns(
  actions: LeaseColumnActions,
): ColumnDef<LeaseListItem, unknown>[] {
  return [
    {
      accessorKey: 'unitId',
      header: 'Unit',
      cell: ({ row }) => (
        <span className="font-medium">Unit {row.original.unitId}</span>
      ),
    },
    {
      accessorKey: 'residentId',
      header: 'Resident',
      cell: ({ row }) => (
        <span className="text-sm text-muted-foreground">
          {row.original.residentId.slice(0, 8)}...
        </span>
      ),
    },
    {
      accessorKey: 'startDate',
      header: 'Start Date',
      cell: ({ row }) => formatDate(row.original.startDate),
    },
    {
      accessorKey: 'endDate',
      header: 'End Date',
      cell: ({ row }) => formatDate(row.original.endDate),
    },
    {
      accessorKey: 'rentAmount',
      header: () => <div className="text-right">Monthly Rent</div>,
      cell: ({ row }) => (
        <div className="text-right">{formatCurrency(row.original.rentAmount)}</div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge lease={row.original} />,
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const lease = row.original;
        const status = getLeaseStatus(lease);
        const canRenew = status === 'active' || status === 'expiring_soon';
        const canTerminate = status === 'active' || status === 'expiring_soon';

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
  ];
}
