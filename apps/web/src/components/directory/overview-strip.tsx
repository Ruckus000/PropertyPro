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
      className="flex min-w-44 flex-1 flex-col gap-0.5 px-4 py-3 text-left text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus md:min-w-0"
    >
      <span className={cn('whitespace-nowrap text-lg font-semibold leading-tight tabular-nums', valueClassName)}>{value}</span>
      <span className="whitespace-nowrap text-xs text-content-secondary">{label}</span>
    </button>
  );
}

/**
 * One slim strip instead of four summary cards: each figure jumps to the
 * matching filter. Scrolls sideways on phones.
 */
export function OverviewStrip({
  stats,
  requestCount,
  canSeeBalances,
  onOccupancy,
  onPastDue,
  onPortal,
  onRequests,
}: {
  stats: OverviewStats;
  requestCount: number | null;
  canSeeBalances: boolean;
  onOccupancy: () => void;
  onPastDue: () => void;
  onPortal: () => void;
  onRequests: () => void;
}) {
  return (
    <div
      role="group"
      aria-label="Directory overview"
      className="flex divide-x divide-edge-subtle overflow-x-auto rounded-lg border border-edge bg-surface-card"
    >
      <Cell
        onClick={onOccupancy}
        value={
          <>
            {stats.occupiedUnits}
            <span className="text-sm font-medium text-content-tertiary"> / {stats.totalUnits}</span>
          </>
        }
        label={`units occupied · ${stats.vacantUnits} vacant`}
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
        label="access requests to review"
      />
    </div>
  );
}
