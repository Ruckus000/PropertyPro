'use client';

import { BadgeCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Avatar, PortalBadge, avatarToneFor } from './directory-badges';
import { residentTypeLabel, type DirectoryResidentRow } from './directory-model';

// Columns by breakpoint: <md name · portal (unit · type · board in the subline),
// md adds unit · type, xl adds board · phone.
const MD = 'hidden md:table-cell';
const XL = 'hidden xl:table-cell';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

const DESIGNATION_SHORT = { board_president: 'President', board_member: 'Member' } as const;

export function ResidentsTable({
  rows,
  hasOwnerRole,
  onOpenResident,
  onOpenUnit,
  selected,
  onToggle,
  onToggleAll,
}: {
  rows: DirectoryResidentRow[];
  hasOwnerRole: boolean;
  onOpenResident: (userId: string) => void;
  onOpenUnit: (unitId: number) => void;
  /** Selection is always a subset of `rows` — the caller intersects it. */
  selected: ReadonlySet<string>;
  onToggle: (userId: string) => void;
  onToggleAll: () => void;
}) {
  const selectedCount = rows.filter((r) => selected.has(r.userId)).length;
  const allState = selectedCount === 0 ? false : selectedCount === rows.length ? true : 'indeterminate';
  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-surface-card">
      <Table aria-label="Residents">
        <TableHeader className="bg-surface-subtle">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-11 pr-0">
              <Checkbox checked={allState} onCheckedChange={onToggleAll} aria-label="Select all shown residents" />
            </TableHead>
            <TableHead>Name</TableHead>
            <TableHead className={MD}>Unit</TableHead>
            <TableHead className={MD}>Type</TableHead>
            <TableHead className={XL}>Board</TableHead>
            <TableHead className="text-right md:text-left">Portal</TableHead>
            <TableHead className={XL}>Phone</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const isOwner = hasOwnerRole && r.isUnitOwner;
            const typeLabel = residentTypeLabel(r, hasOwnerRole);
            const board = r.designation ? DESIGNATION_SHORT[r.designation] : null;
            const mobileSubline = [
              r.unit ? `Unit ${r.unit.unitNumber}` : 'No unit',
              typeLabel,
              board && `Board ${board.toLowerCase()}`,
            ]
              .filter(Boolean)
              .join(' · ');
            return (
              <TableRow key={r.userId} data-state={selected.has(r.userId) ? 'selected' : undefined}>
                <TableCell className="w-11 pr-0">
                  {/* 44px hit area on touch via the cell; the box itself stays 16px. */}
                  <Checkbox
                    checked={selected.has(r.userId)}
                    onCheckedChange={() => onToggle(r.userId)}
                    aria-label={`Select ${r.displayName}`}
                  />
                </TableCell>
                <TableCell className="max-w-0 py-1.5">
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
                </TableCell>
                <TableCell className={MD}>
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
                </TableCell>
                <TableCell className={MD}>
                  <span
                    className={cn(
                      'inline-flex h-6 items-center rounded-full px-2 text-xs font-medium',
                      r.occupantId !== undefined
                        ? 'bg-surface-muted text-content-secondary'
                        : isOwner
                          ? 'bg-interactive-subtle text-content-brand'
                          : 'bg-status-info-bg text-status-info',
                    )}
                  >
                    {typeLabel}
                  </span>
                </TableCell>
                <TableCell className={cn(XL, 'text-xs text-content-secondary')}>
                  <span className="inline-flex items-center gap-1.5">
                    {board ? <BadgeCheck size={14} className="text-content-tertiary" aria-hidden="true" /> : null}
                    {board ?? '—'}
                  </span>
                </TableCell>
                <TableCell className="text-right md:text-left">
                  <PortalBadge status={r.portalStatus} />
                </TableCell>
                <TableCell className={cn(XL, 'whitespace-nowrap text-xs text-content-secondary')}>
                  {r.phone ?? '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
