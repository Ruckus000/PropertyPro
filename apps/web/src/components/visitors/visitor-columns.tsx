'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, Ban } from 'lucide-react';
import type { VisitorListItem } from '@/hooks/use-visitors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { VisitorQRCode } from './VisitorQRCode';
import {
  deriveVisitorStatus,
  type VisitorStatus,
} from '@/lib/visitors/visitor-logic';

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

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return '\u2014';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
}

function formatGuestType(guestType: VisitorListItem['guestType']): string {
  switch (guestType) {
    case 'one_time':
      return 'One-Time';
    case 'recurring':
      return 'Recurring';
    case 'permanent':
      return 'Permanent';
    case 'vendor':
      return 'Vendor';
  }
}

function formatVehicle(visitor: VisitorListItem): string {
  const details = [visitor.vehicleColor, visitor.vehicleMake, visitor.vehicleModel]
    .filter(Boolean)
    .join(' ');
  if (details && visitor.vehiclePlate) return `${details} · ${visitor.vehiclePlate}`;
  return details || visitor.vehiclePlate || '\u2014';
}

export function getVisitorStatus(visitor: VisitorListItem): VisitorStatus {
  return deriveVisitorStatus({
    checkedInAt: parseDate(visitor.checkedInAt),
    checkedOutAt: parseDate(visitor.checkedOutAt),
    validUntil: parseDate(visitor.validUntil),
    revokedAt: parseDate(visitor.revokedAt),
  });
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
    case 'overstayed':
      return (
        <Badge className="gap-1 bg-status-warning-bg text-status-warning hover:bg-status-warning-bg">
          <AlertTriangle className="h-3.5 w-3.5" />
          Overstayed
        </Badge>
      );
    case 'checked_out':
      return (
        <Badge className="bg-interactive-muted text-content-link hover:bg-interactive-muted">
          Checked Out
        </Badge>
      );
    case 'expired':
      return (
        <Badge className="bg-surface-muted text-content-tertiary hover:bg-surface-muted">
          Expired
        </Badge>
      );
    case 'revoked':
      return (
        <Badge className="gap-1 bg-status-danger-bg text-status-danger hover:bg-status-danger-bg">
          <Ban className="h-3.5 w-3.5" />
          Revoked
        </Badge>
      );
    case 'revoked_on_site':
      return (
        <Badge className="gap-1 bg-status-danger-bg text-status-danger hover:bg-status-danger-bg">
          <Ban className="h-3.5 w-3.5" />
          Revoked On-Site
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
  onRevoke: (visitor: VisitorListItem) => void;
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
      accessorKey: 'guestType',
      header: 'Guest Type',
      cell: ({ row }) => (
        <Badge variant="outline" className="border-edge">
          {formatGuestType(row.original.guestType)}
        </Badge>
      ),
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
      id: 'duration',
      header: 'Duration',
      cell: ({ row }) => formatDuration(row.original.expectedDurationMinutes),
    },
    {
      id: 'vehicle',
      header: 'Vehicle',
      cell: ({ row }) => (
        <span className="text-sm text-content-secondary">{formatVehicle(row.original)}</span>
      ),
    },
    {
      id: 'passCode',
      header: 'Passcode',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs">
            {row.original.passCode ?? '\u2014'}
          </span>
          {row.original.passCode ? <VisitorQRCode passCode={row.original.passCode} /> : null}
        </div>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        const visitor = row.original;
        const status = getVisitorStatus(visitor);

        return (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {status === 'expected' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => actions.onCheckIn(visitor)}
              >
                Check In
              </Button>
            ) : null}

            {status === 'checked_in' || status === 'overstayed' || status === 'revoked_on_site' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => actions.onCheckOut(visitor)}
              >
                Check Out
              </Button>
            ) : null}

            {!visitor.revokedAt ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => actions.onRevoke(visitor)}
              >
                Revoke
              </Button>
            ) : null}
          </div>
        );
      },
    },
  ];
}
