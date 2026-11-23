'use client';

import type { ColumnDef } from '@/components/shared/data-table-types';
import { format, isSameDay, isToday } from 'date-fns';
import { AlertTriangle, Ban, MoreHorizontal } from 'lucide-react';
import type { VisitorListItem } from '@/hooks/use-visitors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { VisitorQRCode } from './VisitorQRCode';
import {
  deriveVisitorStatus,
  isAllowedVisitDay,
  isMultiUsePass,
  visitDaysLabel,
  type VisitorStatus,
} from '@/lib/visitors/visitor-logic';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** A time today reads as the time alone; any other day carries its date. */
function formatWhen(value: string | null, now: Date): string {
  const date = parseDate(value);
  if (!date) return '';
  return format(date, isSameDay(date, now) ? 'h:mm a' : 'MMM d, h:mm a');
}

function formatDuration(minutes: number | null): string {
  if (!minutes) return '';
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
  return details || visitor.vehiclePlate || '';
}

export function getVisitorStatus(visitor: VisitorListItem): VisitorStatus {
  return deriveVisitorStatus({
    guestType: visitor.guestType,
    checkedInAt: parseDate(visitor.checkedInAt),
    checkedOutAt: parseDate(visitor.checkedOutAt),
    validUntil: parseDate(visitor.validUntil),
    revokedAt: parseDate(visitor.revokedAt),
  });
}

/**
 * The line under a visitor's status: the one time that matters for it. The
 * arrival time while the guest is expected, the check-in time once on site,
 * both ends of a finished visit, and when a pass ended or was revoked.
 * Empty when there is nothing to add.
 */
export function visitorStatusDetail(visitor: VisitorListItem, now: Date = new Date()): string {
  const when = (value: string | null) => formatWhen(value, now);
  const stay = formatDuration(visitor.expectedDurationMinutes);
  const arrival = parseDate(visitor.expectedArrival);

  switch (getVisitorStatus(visitor)) {
    case 'expected':
      // A multi-use pass is Expected again after each visit, so a finished
      // visit is the news: the guard must see the guest was already in and out.
      if (isMultiUsePass(visitor.guestType)) {
        if (visitor.checkedOutAt) return `Last visit ended ${when(visitor.checkedOutAt)}`;
        // Its expectedArrival is only its first day; on a later day the allowed
        // days say more than a past date.
        if (arrival && arrival < now && !isSameDay(arrival, now)) {
          const days = visitDaysLabel(visitor.recurrenceRule);
          return days ? `Visits ${days}` : '';
        }
      }
      return [when(visitor.expectedArrival), stay ? `${stay} stay` : '']
        .filter(Boolean)
        .join(' · ');
    case 'checked_in':
      return [`Since ${when(visitor.checkedInAt)}`, stay ? `${stay} stay` : '']
        .filter(Boolean)
        .join(' · ');
    case 'overstayed':
      return `In ${when(visitor.checkedInAt)} · due out ${when(visitor.validUntil)}`;
    case 'revoked_on_site':
      return `In ${when(visitor.checkedInAt)} · revoked ${when(visitor.revokedAt)}`;
    case 'checked_out':
      return visitor.checkedInAt
        ? `${when(visitor.checkedInAt)} \u2013 ${when(visitor.checkedOutAt)}`
        : `Out ${when(visitor.checkedOutAt)}`;
    case 'expired':
      return `Pass ended ${when(visitor.validUntil)}`;
    case 'revoked':
      return `Revoked ${when(visitor.revokedAt)}`;
  }
}

/**
 * The staff Today tab: passes arriving today, plus a recurring, vendor or
 * permanent pass on every day the guest may use it (its `expectedArrival` is
 * only its first day). The day rule uses this device's timezone: the gate
 * tablet is on site.
 */
export function isOnTodayList(
  visitor: VisitorListItem,
  now: Date = new Date(),
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): boolean {
  const arrival = parseDate(visitor.expectedArrival);
  if (arrival && isToday(arrival)) return true;
  if (!isMultiUsePass(visitor.guestType)) return false;
  const status = getVisitorStatus(visitor);
  if (status === 'checked_in' || status === 'overstayed') return true;
  const validFrom = parseDate(visitor.validFrom);
  return (
    status === 'expected' &&
    (!validFrom || validFrom <= now) &&
    isAllowedVisitDay(visitor.recurrenceRule, now, timeZone)
  );
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
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
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
          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
          Revoked
        </Badge>
      );
    case 'revoked_on_site':
      return (
        <Badge className="gap-1 bg-status-danger-bg text-status-danger hover:bg-status-danger-bg">
          <Ban className="h-3.5 w-3.5" aria-hidden="true" />
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

export interface VisitorColumnOptions {
  /** Replaces the status badge; the page kit passes a glyph and the same word. */
  renderStatus?: (status: VisitorStatus) => React.ReactNode;
}

const DETAIL_CLASS = 'text-sm text-content-secondary';

/**
 * The gate's columns: who, which unit, where the visit stands, the passcode,
 * and the row's actions. Purpose, guest type and vehicle sit under the name;
 * the arrival and check-in / check-out times sit under the status. Five columns
 * fit the page at 1280px and 1440px in large text, where eleven did not
 * (1440px of table in a 1092px box, measured 2026-11-23).
 */
export function getVisitorColumns(
  actions: VisitorColumnActions,
  options?: VisitorColumnOptions,
): ColumnDef<VisitorListItem, unknown>[] {
  return [
    {
      accessorKey: 'visitorName',
      header: 'Visitor',
      // No `absorbSlack`: its `max-width: 0` lets the column shrink to nothing
      // (72px at a 375px screen, measured). The name and its lines wrap, so the
      // column takes the slack anyway, and the floor below keeps a name readable
      // on a narrow screen: under it the table scrolls instead.
      cell: ({ row }) => {
        const vehicle = formatVehicle(row.original);
        return (
          <div className="min-w-40">
            <div className="font-medium">{row.original.visitorName}</div>
            <div className={`${DETAIL_CLASS} line-clamp-2`} title={row.original.purpose}>
              {formatGuestType(row.original.guestType)} · {row.original.purpose}
            </div>
            {vehicle ? <div className={DETAIL_CLASS}>{vehicle}</div> : null}
          </div>
        );
      },
    },
    {
      accessorKey: 'hostUnitLabel',
      header: 'Host',
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          Unit {row.original.hostUnitLabel ?? row.original.hostUnitId}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const detail = visitorStatusDetail(row.original);
        return (
          <div>
            {options?.renderStatus ? (
              options.renderStatus(getVisitorStatus(row.original))
            ) : (
              <StatusBadge visitor={row.original} />
            )}
            {/* One line where the page has room for it (1280px up); it wraps on a tablet. */}
            {detail ? <div className={`${DETAIL_CLASS} xl:whitespace-nowrap`}>{detail}</div> : null}
          </div>
        );
      },
    },
    {
      id: 'passCode',
      header: 'Passcode',
      cell: ({ row }) => (
        <div className="flex items-center gap-1 whitespace-nowrap">
          <span className="font-mono">{row.original.passCode ?? '\u2014'}</span>
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
        const canRevoke = !visitor.revokedAt && status !== 'checked_out' && status !== 'expired';

        return (
          <div className="flex items-center justify-end gap-1 whitespace-nowrap">
            {status === 'expected' ? (
              <Button variant="outline" size="sm" onClick={() => actions.onCheckIn(visitor)}>
                Check In
              </Button>
            ) : null}

            {status === 'checked_in' || status === 'overstayed' || status === 'revoked_on_site' ? (
              <Button variant="outline" size="sm" onClick={() => actions.onCheckOut(visitor)}>
                Check Out
              </Button>
            ) : null}

            {/* Revoking is rare and ends the pass, so it sits one step away from Check In. */}
            {canRevoke ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreHorizontal className="size-4" aria-hidden="true" />
                    <span className="sr-only">More actions for {visitor.visitorName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => actions.onRevoke(visitor)}>
                    <Ban className="mr-2 size-4 text-content-tertiary" aria-hidden="true" />
                    Revoke pass
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        );
      },
    },
  ];
}
