'use client';

import { BadgeCheck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, PortalBadge, avatarToneFor } from './directory-badges';
import type { DirectoryResidentRow } from './directory-model';

// Visible columns per breakpoint (hidden cells take no grid track):
//   <md  name · portal            (unit · type · board move to the subline)
//   md   name · unit · type · portal
//   xl   name · unit · type · board · portal · phone
const COLS =
  'grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_5rem_6rem_8rem] xl:grid-cols-[minmax(0,2fr)_5rem_6rem_minmax(0,1fr)_8rem_9rem]';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

const DESIGNATION_SHORT = { board_president: 'President', board_member: 'Member' } as const;

export function ResidentsTable({
  rows,
  hasOwnerRole,
  onOpenResident,
  onOpenUnit,
}: {
  rows: DirectoryResidentRow[];
  hasOwnerRole: boolean;
  onOpenResident: (userId: string) => void;
  onOpenUnit: (unitId: number) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-surface-card" role="table" aria-label="Residents">
      <div role="rowgroup">
        <div
          role="row"
          className={cn(
            'grid items-center gap-3 border-b border-edge bg-surface-subtle px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-content-tertiary',
            COLS,
          )}
        >
          <span role="columnheader">Name</span>
          <span role="columnheader" className="hidden md:block">Unit</span>
          <span role="columnheader" className="hidden md:block">Type</span>
          <span role="columnheader" className="hidden xl:block">Board</span>
          <span role="columnheader" className="justify-self-end md:justify-self-start">Portal</span>
          <span role="columnheader" className="hidden xl:block">Phone</span>
        </div>
      </div>
      <div role="rowgroup">
        {rows.map((r, i) => {
          const isOwner = hasOwnerRole && r.isUnitOwner;
          const typeLabel = isOwner ? 'Owner' : 'Tenant';
          const board = r.designation ? DESIGNATION_SHORT[r.designation] : null;
          const mobileSubline = [r.unit ? `Unit ${r.unit.unitNumber}` : 'No unit', typeLabel, board && `Board ${board.toLowerCase()}`]
            .filter(Boolean)
            .join(' · ');
          return (
            <div
              key={r.userId}
              role="row"
              className={cn('grid min-h-14 items-center gap-3 px-4 py-1.5 text-sm', COLS, i > 0 && 'border-t border-edge-subtle')}
            >
              <span role="cell" className="min-w-0">
                <button
                  type="button"
                  onClick={() => onOpenResident(r.userId)}
                  className={cn('flex w-full min-w-0 items-center gap-3 rounded-sm py-1 text-left text-content', FOCUS)}
                >
                  <Avatar initials={r.initials} tone={avatarToneFor(r.isUnitOwner, hasOwnerRole)} size="lg" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-semibold" title={r.displayName}>
                      {r.displayName}
                    </span>
                    {/* Email on tablet+; on phones the subline carries unit · type · board. */}
                    <span className="hidden truncate text-xs text-content-tertiary md:block" title={r.email ?? undefined}>
                      {r.email}
                      {board ? <span className="xl:hidden"> · Board {board.toLowerCase()}</span> : null}
                    </span>
                    <span className="truncate text-xs text-content-tertiary md:hidden">{mobileSubline}</span>
                  </span>
                </button>
              </span>
              <span role="cell" className="hidden md:block">
                {r.unit ? (
                  <button
                    type="button"
                    onClick={() => onOpenUnit(r.unit!.id)}
                    title={r.unit.locationLabel}
                    className={cn('font-medium text-content-link hover:underline', FOCUS)}
                  >
                    {r.unit.unitNumber}
                  </button>
                ) : (
                  <span className="text-content-tertiary">—</span>
                )}
              </span>
              <span role="cell" className="hidden md:block">
                <span
                  className={cn(
                    'inline-flex h-6 items-center rounded-full px-2 text-xs font-medium',
                    isOwner ? 'bg-interactive-subtle text-content-brand' : 'bg-status-info-bg text-status-info',
                  )}
                >
                  {typeLabel}
                </span>
              </span>
              <span role="cell" className="hidden items-center gap-1.5 text-xs text-content-secondary xl:inline-flex">
                {board ? <BadgeCheck size={14} className="text-content-tertiary" aria-hidden="true" /> : null}
                {board ?? '—'}
              </span>
              <span role="cell" className="justify-self-end md:justify-self-start">
                <PortalBadge status={r.portalStatus} />
              </span>
              <span role="cell" className="hidden whitespace-nowrap text-xs tabular-nums text-content-secondary xl:block">
                {r.phone ?? '—'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
