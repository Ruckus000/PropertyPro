'use client';

/**
 * The unit roster table: one row per unit, grouped by floor when sorted by
 * unit number, collapsible groups, 50 rows at a time.
 *
 * Keyboard (audit P1): every row opens with Enter or Space — including rows
 * with no next-step link (Leased, Month-to-month), which were unreachable in
 * the prototype. The row's unit cell holds the real button; the whole row is
 * also clickable for the mouse. The next-step link is its own button and does
 * not also open the row.
 */
import { ChevronDown, ChevronRight, Clock, AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  ACTION_LABEL,
  inDays,
  initials,
  span,
  tierOf,
  type RosterGroup,
  type RowAction,
  type UnitModel,
} from '@/lib/leases/roster-model';
import { daysBetween } from '@/lib/leases/lease-state';
import { Table } from '@/components/ui/table';
import { LeaseStatus } from './LeaseStatus';

export const PAGE_SIZE = 50;

const fmt = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const fmtShort = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const money0 = (v: string | null | undefined) =>
  v == null ? '—' : `$${Math.round(Number(v)).toLocaleString('en-US')}`;

const TIER_CLASS = {
  critical: 'text-status-danger font-semibold',
  urgent: 'text-status-warning font-semibold',
  aware: 'text-status-warning font-medium',
  calm: 'text-content-secondary',
} as const;

function StageText({ m, today }: { m: UnitModel; today: string }) {
  const o = m.offer;
  const pre = m.next && !m.state.renewalSigned ? ' · pre-leased' : '';
  const map: Record<string, [string, string]> = {
    not_started: ['No offer yet', 'text-content-secondary'],
    offer_sent: [o ? `Offer sent ${o.sentOn === today ? 'today' : fmtShort(o.sentOn)}` : 'Offer sent', 'text-status-info'],
    offer_expired: [o ? `Offer expired ${fmtShort(o.expiresOn)}` : 'Offer expired', 'text-status-warning'],
    accepted: ['Accepted · not signed', 'text-status-success'],
    declined: [`Declined · out ${m.state.stopDate ? fmtShort(m.state.stopDate) : ''}${pre}`, 'text-status-warning'],
    notice: [`Moving out ${m.state.stopDate ? fmtShort(m.state.stopDate) : ''}${pre}`, 'text-status-warning'],
    signed: [`Renewed · starts ${m.next ? fmtShort(m.next.startDate) : ''}`, 'text-status-success'],
    ending: [`${m.current?.endVia === 'transfer' ? 'Transferring' : 'Ending early'}${pre}`, 'text-status-warning'],
  };
  if (!m.stage) return null;
  const [text, cls] = map[m.stage]!;
  return <span className={cn('text-xs', cls)}>{text}</span>;
}

function EndCell({ m, today }: { m: UnitModel; today: string }) {
  const s = m.state;
  const c = m.current;
  let main = '—';
  let sub = '';
  const tier = tierOf(m);
  if (!c) {
    if (m.next) {
      main = m.next.endDate ? fmt(m.next.endDate) : 'No end date';
      sub = 'New lease';
    } else if (m.unit.offlineUntil) {
      sub = `Back ${fmtShort(m.unit.offlineUntil)}`;
    }
  } else if (s.kind === 'ending' && s.stopDate) {
    main = fmt(s.stopDate);
    sub = `${c.endVia === 'transfer' ? 'Transfer' : 'Ends early'} · ${inDays(s.daysUntil ?? 0)}`;
  } else if (!c.endDate) {
    main = 'No end date';
    sub = `Since ${fmt(c.startDate)}`;
  } else if (s.kind === 'holdover') {
    main = fmt(c.endDate);
    sub = `${span(daysBetween(c.endDate, today))} past end`;
  } else {
    main = fmt(c.endDate);
    const d = s.daysUntil ?? 0;
    sub = inDays(d).replace(/^./, (ch) => ch.toUpperCase());
  }
  const Icon = tier === 'critical' ? AlertTriangle : tier === 'urgent' ? Clock : null;
  return (
    <div className="flex flex-col">
      <span className="text-sm text-content">{main}</span>
      {sub && (
        <span className={cn('inline-flex items-center gap-1 text-xs', c ? TIER_CLASS[tier] : 'text-content-secondary')}>
          {Icon && c && <Icon aria-hidden="true" className="size-3" />}
          {sub}
        </span>
      )}
    </div>
  );
}

function ResidentCell({ m, today }: { m: UnitModel; today: string }) {
  const [first, ...rest] = m.people;
  if (!first) {
    const note =
      m.state.kind === 'offline'
        ? `Offline · ${(m.unit.offlineReason ?? 'other').replace(/_/g, ' ')}`
        : m.state.vacantSince
          ? daysBetween(m.state.vacantSince, today) <= 0
            ? 'Vacant since today'
            : `Vacant ${span(daysBetween(m.state.vacantSince, today))}`
          : 'No lease on record';
    return (
      <div className="flex items-center gap-2.5">
        <span aria-hidden="true" className="size-8 shrink-0 rounded-full border border-dashed border-edge-strong" />
        <span className="text-sm text-content-secondary">{note}</span>
      </div>
    );
  }
  const subLine = !m.current && m.next ? `Moves in ${fmt(m.next.startDate)}` : rest.length ? `& ${rest.map((p) => p.name).join(', ')}` : null;
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-content-secondary"
      >
        {initials(first.name)}
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-content">{first.name}</div>
        {subLine && <div className="truncate text-xs text-content-secondary">{subLine}</div>}
      </div>
    </div>
  );
}

export function RosterTable({
  groups,
  today,
  selectedUnitId,
  limit,
  onOpen,
  onAction,
}: {
  groups: RosterGroup[];
  today: string;
  selectedUnitId: number | null;
  limit: number;
  onOpen: (unitId: number) => void;
  onAction: (m: UnitModel, action: RowAction) => void;
}) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // Grouped views show every group (they are already bounded by the floors);
  // a flat list pages at `limit`.
  let budget = groups.length > 1 ? Number.POSITIVE_INFINITY : limit;

  return (
    <Table className="w-full border-collapse text-left">
      <caption className="sr-only">Units and their leases</caption>
      <thead>
        <tr className="border-b border-edge text-xs font-medium text-content-secondary">
          <th scope="col" className="px-4 py-2.5 font-medium">Unit</th>
          <th scope="col" className="px-4 py-2.5 font-medium">Resident</th>
          <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
          <th scope="col" className="hidden px-4 py-2.5 font-medium md:table-cell">Lease end</th>
          <th scope="col" className="hidden px-4 py-2.5 text-right font-medium lg:table-cell">Rent</th>
          <th scope="col" className="px-4 py-2.5 font-medium">Renewal</th>
        </tr>
      </thead>
      {groups.map((g) => {
        const isCollapsed = !!collapsed[g.key];
        const visible = isCollapsed ? [] : g.rows.slice(0, budget);
        budget -= visible.length;
        return (
          <tbody key={g.key}>
            {g.title && (
              <tr className="border-b border-edge-subtle bg-surface-muted">
                <th scope="colgroup" colSpan={6} className="px-4 py-2 text-left">
                  <button
                    type="button"
                    aria-expanded={!isCollapsed}
                    onClick={() => setCollapsed((c) => ({ ...c, [g.key]: !c[g.key] }))}
                    className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus"
                  >
                    {isCollapsed ? (
                      <ChevronRight aria-hidden="true" className="size-4" />
                    ) : (
                      <ChevronDown aria-hidden="true" className="size-4" />
                    )}
                    {g.title}
                  </button>
                  {g.meta && <span className="ml-2 text-xs font-normal text-content-secondary">{g.meta}</span>}
                </th>
              </tr>
            )}
            {visible.map((m) => (
              <tr
                key={m.unit.id}
                onClick={() => onOpen(m.unit.id)}
                className={cn(
                  'cursor-pointer border-b border-edge-subtle transition-colors hover:bg-surface-hover',
                  selectedUnitId === m.unit.id ? 'bg-surface-hover' : 'bg-surface-card',
                )}
              >
                <td className="px-4 py-3">
                  <button
                    type="button"
                    aria-label={`Open Unit ${m.unit.unitNumber}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpen(m.unit.id);
                    }}
                    className="rounded text-sm font-semibold tabular-nums text-content focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus"
                  >
                    {m.unit.unitNumber}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <ResidentCell m={m} today={today} />
                </td>
                <td className="px-4 py-3">
                  <LeaseStatus status={m.status} />
                </td>
                <td className="hidden px-4 py-3 md:table-cell">
                  <EndCell m={m} today={today} />
                </td>
                <td className="hidden px-4 py-3 text-right lg:table-cell">
                  {m.current || m.next ? (
                    <span className="text-sm tabular-nums text-content">
                      {m.current?.rentAmount == null && m.next?.rentAmount == null
                        ? 'Not recorded'
                        : money0((m.current ?? m.next)!.rentAmount)}
                    </span>
                  ) : (
                    <span className="flex flex-col items-end">
                      <span className="text-sm tabular-nums text-content-secondary">{money0(m.unit.rentAmount)}</span>
                      <span className="text-xs text-content-tertiary">Market</span>
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-0.5">
                    <StageText m={m} today={today} />
                    {m.action && (
                      <button
                        type="button"
                        aria-label={`${ACTION_LABEL[m.action]}, Unit ${m.unit.unitNumber}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onAction(m, m.action!);
                        }}
                        className="rounded text-sm font-medium text-interactive hover:text-interactive-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus"
                      >
                        {ACTION_LABEL[m.action]} <span aria-hidden="true">→</span>
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        );
      })}
    </Table>
  );
}
