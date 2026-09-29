'use client';

/**
 * The four summary tiles. They are also the page's filters: pressing one
 * filters the list (pressing it again returns to All units), and the selected
 * tile carries the interactive-colour bar. Built as a radio-like button group
 * so the selection is announced.
 */
import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { RosterFilter, RosterTiles as Tiles } from '@/lib/leases/roster-model';

interface TileDef {
  key: Exclude<RosterFilter, 'past'>;
  label: string;
  value: number;
  unit: string;
  sub: string;
  alert?: string;
  barPct?: number;
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

export function RosterTiles({
  tiles,
  active,
  onSelect,
}: {
  tiles: Tiles;
  active: RosterFilter;
  onSelect: (filter: Exclude<RosterFilter, 'past'>) => void;
}) {
  const { all, renewalsDue: due, vacant, monthToMonth } = tiles;
  const defs: TileDef[] = [
    {
      key: 'all',
      label: 'All units',
      value: all.units,
      unit: plural(all.units, 'unit', 'units'),
      sub: `${all.occupied} occupied · ${all.occupancyPct.toFixed(1)}% occupancy${all.offline ? ` · ${all.offline} offline` : ''}`,
      barPct: all.occupancyPct,
    },
    {
      key: 'expiring',
      label: 'Renewals due',
      value: due.count,
      unit: plural(due.count, 'lease', 'leases'),
      sub: `Ending within ${due.window} days · ${due.withoutOffer} without an offer`,
      alert: due.holdovers ? `${due.holdovers} past end date` : undefined,
    },
    {
      key: 'vacant',
      label: 'Vacant',
      value: vacant.count,
      unit: plural(vacant.count, 'unit', 'units'),
      sub: [
        vacant.empty ? `Avg. ${vacant.avgDaysEmpty} days empty` : vacant.count ? 'All pre-leased' : 'Every unit is occupied',
        vacant.preLeased && vacant.empty ? `${vacant.preLeased} pre-leased` : null,
        vacant.movingOut ? `${vacant.movingOut} moving out` : null,
        vacant.offline ? `${vacant.offline} offline` : null,
      ]
        .filter(Boolean)
        .join(' · '),
    },
    {
      key: 'm2m',
      label: 'Month-to-month',
      value: monthToMonth.count,
      unit: plural(monthToMonth.count, 'lease', 'leases'),
      sub: 'No end date on file',
    },
  ];

  return (
    <div role="group" aria-label="Filter units" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {defs.map((t) => {
        const selected = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            aria-pressed={selected}
            onClick={() => onSelect(selected && t.key !== 'all' ? 'all' : t.key)}
            className={cn(
              'relative flex min-h-28 flex-col rounded-lg border bg-surface-card p-4 text-left transition-colors',
              'hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-edge-focus',
              selected ? 'border-edge-strong' : 'border-edge',
            )}
          >
            <span className={cn('text-sm font-medium', selected ? 'text-content' : 'text-content-secondary')}>
              {t.label}
            </span>
            <span className="mt-1 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tabular-nums text-content">{t.value}</span>
              <span className="text-sm text-content-secondary">{t.unit}</span>
            </span>
            {t.alert && (
              <span className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-status-danger">
                <AlertTriangle aria-hidden="true" className="size-3.5" />
                {t.alert}
              </span>
            )}
            {t.barPct !== undefined && (
              <span aria-hidden="true" className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
                <span className="block h-full rounded-full bg-status-success" style={{ width: `${Math.min(100, t.barPct)}%` }} />
              </span>
            )}
            <span className="mt-auto pt-2 text-xs text-content-secondary">{t.sub}</span>
            <span
              aria-hidden="true"
              className={cn('absolute inset-x-4 bottom-0 h-0.5 rounded-full', selected ? 'bg-interactive' : 'bg-transparent')}
            />
          </button>
        );
      })}
    </div>
  );
}
