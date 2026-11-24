'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { formatCents, plural, type OverviewStats } from './directory-model';

function Cell({
  value,
  label,
  onClick,
  valueClassName,
}: {
  value: ReactNode;
  label: string;
  onClick: () => void;
  valueClassName?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // min-w-0 so a cell is never wider than its track; the caption wraps
      // inside it. The -1px margins put each cell's top and left rule under its
      // neighbour's edge (or the strip's own border), in both arrangements.
      className="-ml-px -mt-px flex min-w-0 flex-col gap-0.5 border-l border-t border-edge-subtle px-4 py-3 text-left text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
    >
      <span className={cn('whitespace-nowrap text-lg font-semibold leading-tight tabular-nums', valueClassName)}>{value}</span>
      <span className="text-xs text-content-secondary">{label}</span>
    </button>
  );
}

/**
 * One slim strip instead of four summary cards: each figure jumps to the
 * matching filter. Two columns by two rows until its own box is 960px wide
 * (`cq-lg`), then one row of equal cells. Nothing scrolls sideways.
 */
export function OverviewStrip({
  stats,
  requestCount,
  canSeeBalances,
  onOccupancy,
  onPastDue,
  onPortal,
  onRequests,
  unsetLabel = 'not set',
}: {
  stats: OverviewStats;
  /** A unit with no occupancy: "not set" (condo/HOA) or "offline" (apartment: leases decide occupancy, so only an offline unit has none). */
  unsetLabel?: string;
  requestCount: number | null;
  canSeeBalances: boolean;
  onOccupancy: () => void;
  onPastDue: () => void;
  onPortal: () => void;
  onRequests: () => void;
}) {
  return (
    <div className="cq">
    <div
      role="group"
      aria-label="Directory overview"
      className="grid grid-cols-2 overflow-hidden rounded-lg border border-edge bg-surface-card cq-lg:grid-flow-col cq-lg:auto-cols-fr cq-lg:grid-cols-none"
    >
      <Cell
        onClick={onOccupancy}
        value={
          <>
            {stats.occupiedUnits}
            <span className="text-sm font-medium text-content-tertiary"> / {stats.totalUnits}</span>
          </>
        }
        label={`units occupied · ${stats.vacantUnits} vacant${stats.unsetUnits > 0 ? ` · ${stats.unsetUnits} ${unsetLabel}` : ''}`}
      />
      {canSeeBalances ? (
        <Cell
          onClick={onPastDue}
          value={formatCents(stats.pastDueCents)}
          valueClassName={stats.pastDueUnits > 0 ? 'text-status-danger' : undefined}
          label={
            stats.pastDueUnits > 0
              ? `past due · ${plural(stats.pastDueUnits, 'unit')} · oldest ${plural(stats.oldestPastDueDays, 'day')}`
              : 'nothing past due'
          }
        />
      ) : null}
      <Cell
        onClick={onPortal}
        value={stats.adoptionPct === null ? '—' : `${stats.adoptionPct}%`}
        label={`using the portal · ${stats.notActiveResidents} not yet`}
      />
      <Cell
        onClick={onRequests}
        value={
          <span className="inline-flex items-center gap-2">
            {requestCount ?? '—'}
            {requestCount ? <span aria-hidden="true" className="h-2 w-2 rounded-full bg-interactive" /> : null}
          </span>
        }
        valueClassName={requestCount ? 'text-content-brand' : undefined}
        label="join requests to review"
      />
    </div>
    </div>
  );
}
