'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { format, parseISO } from 'date-fns';
import type { VisitorListItem } from '@/hooks/use-visitors';
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

type VisitorStatus = 'expected' | 'checked_in' | 'checked_out';

function getVisitorStatus(visitor: VisitorListItem): VisitorStatus {
  if (visitor.checkedOutAt) return 'checked_out';
  if (visitor.checkedInAt) return 'checked_in';
  return 'expected';
}

function StatusBadge({ visitor }: { visitor: VisitorListItem }) {
  const status = getVisitorStatus(visitor);

  switch (status) {
    case 'expected':
      return (
        <Badge className="bg-surface-muted text-content-secondary hover:bg-surface-muted">
          Expected
        </Badge>
      );
    case 'checked_in':
      return (
        <Badge className="bg-status-success-bg text-status-success hover:bg-status-success-bg">
          Checked In
        </Badge>
      );
    case 'checked_out':
      return (
        <Badge className="bg-interactive-muted text-content-link hover:bg-interactive-muted">
          Checked Out
        </Badge>
      );
  }
}

// ---------------------------------------------------------------------------
// Column factory
// ---------------------------------------------------------------------------

export interface VisitorColumnActions {
  onCheckIn: (visitor: VisitorListItem) => void;
  onCheckOut: (visitor: VisitorListItem) => void;
}

export function getVisitorColumns(
  actions: VisitorColumnActions,
): ColumnDef<VisitorListItem, unknown>[] {
  return [
    {
      accessorKey: 'visitorName',
      header: 'Visitor Name',
      cell: ({ row }) => (
        <span className="font-medium">{row.original.visitorName}</span>
      ),
    },
    {
      accessorKey: 'purpose',
      header: 'Purpose',
    },
    {
      accessorKey: 'hostUnitId',
      header: 'Host',
      cell: ({ row }) => `Unit ${row.original.hostUnitId}`,
    },
    {
      accessorKey: 'expectedArrival',
      header: 'Expected Arrival',
      cell: ({ row }) => formatDatetime(row.original.expectedArrival),
    },
    {
      accessorKey: 'checkedInAt',
      header: 'Checked In',
      cell: ({ row }) => formatDatetime(row.original.checkedInAt),
    },
    {
      accessorKey: 'checkedOutAt',
      header: 'Checked Out',
      cell: ({ row }) => formatDatetime(row.original.checkedOutAt),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => <StatusBadge visitor={row.original} />,
    },
    {
      id: 'passCode',
      header: 'Passcode',
      cell: ({ row }) => (
        <span className="font-mono text-xs">
          {row.original.passCode ?? '\u2014'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const visitor = row.original;
        const status = getVisitorStatus(visitor);

        if (status === 'expected') {
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() => actions.onCheckIn(visitor)}
            >
              Check In
            </Button>
          );
        }

        if (status === 'checked_in') {
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={() => actions.onCheckOut(visitor)}
            >
              Check Out
            </Button>
          );
        }

        return null;
      },
    },
  ];
}
