'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { format, parseISO } from 'date-fns';
import type { PackageListItem } from '@/hooks/use-packages';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDatetime(dateStr: string | null): string {
  if (!dateStr) return '\u2014';
  try {
    return format(parseISO(dateStr), 'MMM d, yyyy h:mm a');
  } catch {
    return dateStr;
  }
}

function StatusBadge({ status }: { status: PackageListItem['status'] }) {
  switch (status) {
    case 'received':
      return (
        <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">
          Received
        </Badge>
      );
    case 'notified':
      return (
        <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
          Notified
        </Badge>
      );
    case 'picked_up':
      return (
        <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
          Picked Up
        </Badge>
      );
  }
}

// ---------------------------------------------------------------------------
// Column factory
// ---------------------------------------------------------------------------

export interface PackageColumnActions {
  onMarkPickedUp: (pkg: PackageListItem) => void;
}

export function getPackageColumns(
  actions: PackageColumnActions,
): ColumnDef<PackageListItem, unknown>[] {
  return [
    {
      accessorKey: 'recipientName',
      header: 'Recipient',
      cell: ({ row }) => (
        <span className="font-medium">{row.original.recipientName}</span>
      ),
    },
    {
      accessorKey: 'unitId',
      header: 'Unit',
      cell: ({ row }) => `Unit ${row.original.unitId}`,
    },
    {
      accessorKey: 'carrier',
      header: 'Carrier',
    },
    {
      accessorKey: 'trackingNumber',
      header: 'Tracking #',
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.trackingNumber ?? '\u2014'}
        </span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Received',
      cell: ({ row }) => formatDatetime(row.original.createdAt),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge status={row.original.status} />,
    },
    {
      accessorKey: 'pickedUpAt',
      header: 'Picked Up',
      cell: ({ row }) => formatDatetime(row.original.pickedUpAt),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const pkg = row.original;
        if (pkg.status === 'picked_up') return null;

        return (
          <Button
            variant="outline"
            size="sm"
            onClick={() => actions.onMarkPickedUp(pkg)}
          >
            Mark Picked Up
          </Button>
        );
      },
    },
  ];
}
