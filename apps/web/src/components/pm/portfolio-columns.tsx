'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/shared/data-table-column-header';
import { StatusBadge } from '@/components/shared/status-badge';
import type { PortfolioCommunity } from '@/hooks/use-portfolio-dashboard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  condo_718: 'Condo',
  hoa_720: 'HOA',
  apartment: 'Apartment',
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

/** Maps maintenance count to a status key for consistent icon+text+color display */
function maintenanceStatus(count: number): string {
  if (count === 0) return 'compliant';
  if (count <= 5) return 'pending';
  return 'overdue';
}

/** Maps compliance score to a status key */
function complianceStatus(score: number): string {
  if (score >= 90) return 'compliant';
  if (score >= 80) return 'brand';
  if (score >= 50) return 'pending';
  return 'overdue';
}

// ---------------------------------------------------------------------------
// Column definitions
// ---------------------------------------------------------------------------

export const portfolioColumns: ColumnDef<PortfolioCommunity, unknown>[] = [
  {
    accessorKey: 'communityName',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Community" />
    ),
    cell: ({ row }) => {
      const name = row.original.communityName;
      const type = row.original.communityType;
      return (
        <div className="flex items-center gap-2">
          <span className="font-medium">{name}</span>
          <Badge variant="secondary" className="text-xs">
            {TYPE_LABELS[type] ?? type}
          </Badge>
        </div>
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'totalUnits',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Units" />
    ),
    cell: ({ row }) => row.original.totalUnits,
    enableSorting: true,
  },
  {
    accessorKey: 'residentCount',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Residents" />
    ),
    cell: ({ row }) => row.original.residentCount,
    enableSorting: true,
  },
  {
    accessorKey: 'occupancyRate',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Occupancy" />
    ),
    cell: ({ row }) => {
      const rate = row.original.occupancyRate;
      if (rate === null) return <span className="text-content-tertiary">&mdash;</span>;
      return `${rate}%`;
    },
    enableSorting: true,
  },
  {
    accessorKey: 'openMaintenanceRequests',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Open Maintenance" />
    ),
    cell: ({ row }) => {
      const count = row.original.openMaintenanceRequests;
      const status = maintenanceStatus(count);
      return (
        <StatusBadge
          status={status}
          label={String(count)}
          size="sm"
          subtle
        />
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'complianceScore',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Compliance %" />
    ),
    cell: ({ row }) => {
      const score = row.original.complianceScore;
      if (score == null) return <span className="text-content-tertiary">&mdash;</span>;
      const status = complianceStatus(score);
      return (
        <StatusBadge
          status={status}
          label={`${score}%`}
          size="sm"
          subtle
        />
      );
    },
    enableSorting: true,
  },
  {
    accessorKey: 'outstandingBalance',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Outstanding Balance" />
    ),
    cell: ({ row }) => formatCurrency(row.original.outstandingBalance),
    enableSorting: true,
  },
  {
    id: 'actions',
    header: () => <span className="sr-only">Actions</span>,
    cell: ({ row }) => {
      const community = row.original;
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-surface-hover"
              aria-label={`Actions for ${community.communityName}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <a href={`/pm/dashboard/${community.communityId}`}>
                <ExternalLink className="mr-2 h-4 w-4" />
                View Dashboard
              </a>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    enableSorting: false,
    size: 48,
  },
];
