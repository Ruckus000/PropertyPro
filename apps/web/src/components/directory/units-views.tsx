'use client';

import { AlertCircle, AlertTriangle, Bath, BedDouble, ChevronDown, ChevronRight, Maximize } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, OccupancyBadge, Pill, avatarToneFor } from './directory-badges';
import {
  OCCUPANCY_LABEL,
  formatCents,
  formatRent,
  groupByBuilding,
  plural,
  shortUnitLabel,
  type DirectoryUnit,
} from './directory-model';

export interface UnitsViewProps {
  units: DirectoryUnit[];
  hasOwnerRole: boolean;
  canSeeBalances: boolean;
  onOpenUnit: (unitId: number) => void;
}

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

// Building table rows. Hidden cells (display:none) take no grid track, so each
// breakpoint lists only the columns visible there:
//   <md  unit · owner · chevron
//   md   + balance (when visible)
//   xl   + "lives here"
const ROW_COLS = 'grid-cols-[4.5rem_minmax(0,1fr)_1rem] md:grid-cols-[5rem_minmax(0,1fr)_1rem] xl:grid-cols-[5rem_minmax(0,1.2fr)_minmax(0,1fr)_1rem]';
const ROW_COLS_BALANCE = 'grid-cols-[4.5rem_minmax(0,1fr)_1rem] md:grid-cols-[5rem_minmax(0,1fr)_8rem_1rem] xl:grid-cols-[5rem_minmax(0,1.2fr)_minmax(0,1fr)_8rem_1rem]';

function ownerLineClass(u: DirectoryUnit): string {
  return u.noOwner ? 'text-status-warning' : 'text-content';
}

function occupantLineClass(u: DirectoryUnit): string {
  return u.hasContradiction ? 'text-status-warning' : 'text-content-secondary';
}

/* ─────────────── Cards ─────────────── */

const MAX_AVATARS = 3;

export function UnitCards({ units, hasOwnerRole, canSeeBalances, onOpenUnit }: UnitsViewProps) {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {units.map((u) => {
        const pastDue = canSeeBalances ? u.pastDue : null;
        const rent = hasOwnerRole ? null : formatRent(u.rentAmount);
        const extra = u.residents.length - MAX_AVATARS;
        return (
          <li key={u.id}>
            <button
              type="button"
              onClick={() => onOpenUnit(u.id)}
              className={cn(
                'flex h-full w-full flex-col gap-3.5 rounded-md border border-edge bg-surface-card p-4 text-left text-content transition-shadow duration-quick hover:shadow-e1 motion-reduce:transition-none',
                // Past due: a 4px underline, never a left bar (design decision).
                pastDue && 'border-b-4 border-b-status-danger',
                FOCUS,
              )}
            >
              <span className="flex w-full items-start justify-between gap-2">
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-xl font-semibold leading-tight">{u.unitNumber}</span>
                  <span className="truncate text-xs text-content-tertiary">{u.locationLabel}</span>
                </span>
                <OccupancyBadge occupancy={u.occupancy} confirmed={u.occupancyConfirmed} />
              </span>

              {u.ownerText !== null ? (
                <span className="flex w-full items-center gap-3">
                  {u.residents.length > 0 ? (
                    <span className="flex shrink-0 -space-x-1.5">
                      {u.residents.slice(0, MAX_AVATARS).map((r) => (
                        <Avatar
                          key={r.userId}
                          initials={r.initials}
                          tone={avatarToneFor(r.isUnitOwner, hasOwnerRole)}
                          size="md"
                          ringed
                        />
                      ))}
                      {extra > 0 ? <Avatar initials={`+${extra}`} tone="neutral" size="md" ringed /> : null}
                    </span>
                  ) : (
                    <span aria-hidden="true" className="h-8 w-8 shrink-0 rounded-full border border-dashed border-edge-strong" />
                  )}
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={cn('truncate text-sm font-medium', ownerLineClass(u))} title={u.ownerText}>
                      {u.ownerText}
                    </span>
                    {u.occupantLine ? (
                      <span className={cn('truncate text-xs', occupantLineClass(u))} title={u.occupantLine}>
                        {u.occupantLine}
                      </span>
                    ) : null}
                  </span>
                </span>
              ) : null}

              <span className="flex w-full items-center gap-3.5 text-xs text-content-tertiary">
                <span className="inline-flex items-center gap-1.5">
                  <BedDouble size={14} aria-hidden="true" />
                  {u.bedrooms ?? '—'} bd
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Bath size={14} aria-hidden="true" />
                  {u.bathrooms ?? '—'} ba
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Maximize size={14} aria-hidden="true" />
                  {u.sqft === null ? '—' : u.sqft.toLocaleString('en-US')} sq ft
                </span>
                {rent ? <span className="ml-auto font-semibold text-content">{rent}</span> : null}
              </span>

              {pastDue || u.noOwner ? (
                <span className="flex w-full flex-wrap gap-1.5 border-t border-edge-subtle pt-3">
                  {pastDue ? (
                    <Pill tone="danger" icon={AlertCircle} className="font-semibold">
                      {formatCents(pastDue.amountCents)} past due
                    </Pill>
                  ) : null}
                  {u.noOwner ? (
                    <Pill tone="warning" icon={AlertTriangle}>
                      No owner on file
                    </Pill>
                  ) : null}
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ─────────────── By building ─────────────── */

function tileState(u: DirectoryUnit, canSeeBalances: boolean) {
  if (canSeeBalances && u.pastDue) {
    return {
      className: 'border-status-danger-border bg-status-danger-bg',
      metaClass: 'text-status-danger',
      meta: `${formatCents(u.pastDue.amountCents)} due`,
    };
  }
  if (u.noOwner) {
    return { className: 'border-status-warning-border bg-status-warning-bg', metaClass: 'text-status-warning', meta: 'No owner' };
  }
  if (u.occupancy === 'vacant') {
    return { className: 'border-dashed border-edge-strong bg-surface-card', metaClass: 'text-content-tertiary', meta: 'Vacant' };
  }
  return {
    className: 'border-edge bg-surface-card',
    metaClass: 'text-content-secondary',
    meta: u.owners[0]?.displayName ?? u.residents[0]?.displayName ?? (u.occupancy ? OCCUPANCY_LABEL[u.occupancy] : ''),
  };
}

export function UnitsByBuilding({
  units,
  hasOwnerRole,
  canSeeBalances,
  onOpenUnit,
  collapsed,
  onToggleBuilding,
}: UnitsViewProps & { collapsed: ReadonlySet<string>; onToggleBuilding: (key: string) => void }) {
  const groups = groupByBuilding(units);
  const showOwner = units.some((u) => u.ownerText !== null);

  return (
    <div className="flex flex-col gap-5">
      {groups.map((g) => {
        const open = !collapsed.has(g.key);
        const panelId = `building-panel-${g.key}`;
        const summary = [
          plural(g.units.length, 'unit'),
          `${g.vacantCount} vacant`,
          ...(canSeeBalances ? [`${g.pastDueCount} past due`] : []),
        ].join(' · ');
        return (
          <section key={g.key} className="overflow-hidden rounded-lg border border-edge bg-surface-card">
            <div className={cn('flex flex-col gap-3.5 bg-surface-subtle p-4 md:px-5', open && 'border-b border-edge')}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => onToggleBuilding(g.key)}
                className={cn('-m-1.5 flex w-full items-center gap-3 rounded-sm p-1.5 text-left hover:bg-surface-hover', FOCUS)}
              >
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className={cn('shrink-0 text-content-secondary transition-transform duration-quick motion-reduce:transition-none', !open && '-rotate-90')}
                />
                <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-2.5">
                  <span className="text-lg font-semibold">{g.label}</span>
                  <span className="text-xs text-content-tertiary">{summary}</span>
                </span>
                {!open && canSeeBalances && g.pastDueCount > 0 ? (
                  <Pill tone="danger" className="font-semibold">
                    {g.pastDueCount} past due
                  </Pill>
                ) : null}
              </button>

              {open ? (
                <div className="flex flex-col gap-1.5" aria-label={`${g.label} floor map`}>
                  {g.floors.map((floor) => (
                    <div key={floor.label} className="flex items-stretch gap-2">
                      <span className="flex w-7 shrink-0 items-center justify-center rounded-sm bg-surface-muted text-xs font-semibold text-content-tertiary">
                        <span className="sr-only">Floor </span>
                        {floor.label}
                      </span>
                      <div className="grid flex-1 grid-cols-3 gap-1.5 sm:grid-cols-4">
                        {floor.units.map((u) => {
                          const t = tileState(u, canSeeBalances);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => onOpenUnit(u.id)}
                              title={`${u.unitNumber}${t.meta ? ` — ${t.meta}` : ''}`}
                              className={cn(
                                'flex min-h-12 min-w-0 flex-col items-start gap-0.5 rounded-sm border px-2.5 py-2 text-left hover:shadow-e1',
                                t.className,
                                FOCUS,
                              )}
                            >
                              <span className="max-w-full truncate text-xs font-semibold text-content">
                                {shortUnitLabel(u.unitNumber)}
                              </span>
                              <span className={cn('max-w-full truncate text-xs font-medium', t.metaClass)}>{t.meta}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>

            {open ? (
              <div id={panelId}>
                <div
                  className={cn(
                    'hidden gap-3 border-b border-edge-subtle px-5 py-2 text-xs font-semibold uppercase tracking-wider text-content-tertiary md:grid',
                    canSeeBalances ? ROW_COLS_BALANCE : ROW_COLS,
                  )}
                >
                  <span>Unit</span>
                  <span>{showOwner ? (hasOwnerRole ? 'Owner' : 'Residents') : 'Location'}</span>
                  <span className="hidden xl:block">{showOwner ? 'Lives here' : ''}</span>
                  {canSeeBalances ? <span>Balance</span> : null}
                  <span />
                </div>
                <ul>
                  {g.units.map((u, i) => (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => onOpenUnit(u.id)}
                        className={cn(
                          'grid w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-content hover:bg-surface-hover md:px-5',
                          canSeeBalances ? ROW_COLS_BALANCE : ROW_COLS,
                          'min-h-14',
                          i > 0 && 'border-t border-edge-subtle',
                          FOCUS,
                        )}
                      >
                        <span className="flex flex-col">
                          <span className="font-semibold">{u.unitNumber}</span>
                          <span className="text-xs text-content-tertiary">
                            {u.occupancy ? OCCUPANCY_LABEL[u.occupancy] : '—'}
                          </span>
                        </span>
                        <span className="flex min-w-0 items-center gap-2.5">
                          {u.owners[0] ? <Avatar initials={u.owners[0].initials} tone="owner" size="sm" /> : null}
                          <span className="flex min-w-0 flex-col">
                            <span className={cn('truncate font-medium', ownerLineClass(u))}>
                              {u.ownerText ?? u.locationLabel}
                            </span>
                            {u.occupantLine ? (
                              <span className={cn('truncate text-xs xl:hidden', occupantLineClass(u))}>{u.occupantLine}</span>
                            ) : null}
                          </span>
                        </span>
                        <span className={cn('hidden truncate text-xs xl:block', occupantLineClass(u))}>
                          {u.ownerText !== null ? u.occupantLine : ''}
                        </span>
                        {canSeeBalances ? (
                          <span className="hidden md:block">
                            {u.pastDue ? (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-status-danger">
                                <AlertCircle size={13} aria-hidden="true" />
                                {formatCents(u.pastDue.amountCents)}
                              </span>
                            ) : (
                              <span className="text-xs text-content-tertiary">Nothing overdue</span>
                            )}
                          </span>
                        ) : null}
                        <ChevronRight size={16} className="text-content-tertiary" aria-hidden="true" />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        );
      })}

      <div className="flex flex-wrap gap-4 text-xs text-content-secondary" aria-label="Floor map legend">
        {canSeeBalances ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3.5 w-3.5 rounded-sm border border-status-danger-border bg-status-danger-bg" />
            Past due
          </span>
        ) : null}
        {hasOwnerRole && showOwner ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-3.5 w-3.5 rounded-sm border border-status-warning-border bg-status-warning-bg" />
            No owner on file
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="h-3.5 w-3.5 rounded-sm border border-dashed border-edge-strong bg-surface-card" />
          Vacant
        </span>
      </div>
    </div>
  );
}

/* ─────────────── Split ─────────────── */

export function UnitsSplitList({
  units,
  canSeeBalances,
  selectedId,
  onOpenUnit,
}: UnitsViewProps & { selectedId: number | null }) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-edge bg-surface-card">
      <div className="border-b border-edge bg-surface-subtle px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-content-tertiary">
        {plural(units.length, 'unit')}
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {units.map((u) => {
          const selected = u.id === selectedId;
          return (
            <li key={u.id}>
              <button
                type="button"
                aria-current={selected ? 'true' : undefined}
                onClick={() => onOpenUnit(u.id)}
                className={cn(
                  'flex min-h-14 w-full items-center gap-3 border-b border-edge-subtle px-4 py-2.5 text-left text-content',
                  selected ? 'bg-interactive-subtle' : 'hover:bg-surface-hover',
                  FOCUS,
                )}
              >
                <span className="w-14 shrink-0 truncate text-sm font-semibold" title={u.unitNumber}>
                  {u.unitNumber}
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className={cn('truncate text-xs font-medium', ownerLineClass(u))}>
                    {u.ownerText ?? u.locationLabel}
                  </span>
                  <span className="text-xs text-content-tertiary">
                    {u.occupancy ? OCCUPANCY_LABEL[u.occupancy] : u.locationLabel}
                  </span>
                </span>
                {canSeeBalances && u.pastDue ? (
                  <span className="text-xs font-semibold text-status-danger">{formatCents(u.pastDue.amountCents)}</span>
                ) : null}
                {u.noOwner ? (
                  <AlertTriangle size={14} className="shrink-0 text-status-warning" aria-label="No owner on file" />
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
