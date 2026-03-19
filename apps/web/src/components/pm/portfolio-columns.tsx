'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, ExternalLink, FileText, Megaphone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTableColumnHeader } from '@/components/shared/data-table-column-header';
import type { PortfolioCommunity } from '@/hooks/use-portfolio-dashboard';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<string, string> = {
  condo_718: 'Condo',
  hoa_720: 'HOA',
  apartment: 'Apartment',
};

const TYPE_VARIANTS: Record<string, 'default' | 'secondary' | 'outline'> = {
  condo_718: 'default',
  hoa_720: 'secondary',
  apartment: 'outline',
};

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

function maintenanceColor(count: number): string {
  if (count === 0) return 'text-green-700';
  if (count <= 5) return 'text-amber-600';
  return 'text-red-600';
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
          <Badge variant={TYPE_VARIANTS[type] ?? 'outline'} className="text-[10px]">
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
      if (rate === null) return <span className="text-muted-foreground">&mdash;</span>;
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
      return <span className={maintenanceColor(count)}>{count}</span>;
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
      if (score == null) return <span className="text-muted-foreground">&mdash;</span>;
      return `${score}%`;
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
              className="inline-flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
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
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <FileText className="mr-2 h-4 w-4" />
              Upload Document
            </DropdownMenuItem>
            <DropdownMenuItem>
              <Megaphone className="mr-2 h-4 w-4" />
              Send Announcement
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      );
    },
    enableSorting: false,
    size: 48,
  },
];
