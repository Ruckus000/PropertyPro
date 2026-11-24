'use client';

import { BadgeCheck } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Section } from '@propertypro/ui/components/shared/section';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Avatar, NoticeConsentBadge, PortalBadge, avatarToneFor } from './directory-badges';
import { residentTypeLabel, type DirectoryResidentRow } from './directory-model';

// Five columns from 768px up: select · name · unit · type · portal (owner
// decision, 2026-11-24). The Name cell carries the email and, beneath it, the
// board seat; the phone number is in the resident sheet only. Below md the table
// is name · portal, and the subline carries unit · type · board. The Name cell
// is the one that takes the spare width and the one that gives: `w-full` on its
// header claims every pixel the other columns do not need, and `max-w-0` on its
// cells lets it shrink and truncate instead of widening the table (the same
// pair DataTable's `absorbSlack` uses). Unit, Type and Portal stay on one line,
// so they are exactly as wide as their content.
const MD = 'hidden md:table-cell';
const FIT = 'whitespace-nowrap';

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2';

const DESIGNATION_LABEL = { board_president: 'Board president', board_member: 'Board member' } as const;

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
    <Section>
      <Table aria-label="Residents">
        <TableHeader className="bg-surface-subtle">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-11 pr-0">
              <Checkbox checked={allState} onCheckedChange={onToggleAll} aria-label="Select all shown residents" />
            </TableHead>
            <TableHead className="w-full">Name</TableHead>
            <TableHead className={cn(MD, FIT)}>Unit</TableHead>
            <TableHead className={cn(MD, FIT)}>Type</TableHead>
            <TableHead className={cn(FIT, 'text-right md:text-left')}>Portal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => {
            const isOwner = hasOwnerRole && r.isUnitOwner;
            const typeLabel = residentTypeLabel(r, hasOwnerRole);
            const board = r.designation ? DESIGNATION_LABEL[r.designation] : null;
            const mobileSubline = [
              r.unit ? `Unit ${r.unit.unitNumber}` : 'No unit',
              typeLabel,
              board,
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
                      {/* Email, then the board seat, on tablet+; on phones the subline carries unit · type · board. */}
                      <span className="hidden truncate text-xs text-content-tertiary md:block" title={r.email ?? undefined}>
                        {r.email}
                      </span>
                      {board ? (
                        <span className="hidden items-center gap-1 text-xs text-content-secondary md:inline-flex">
                          <BadgeCheck className="size-3.5 shrink-0 text-content-tertiary" aria-hidden="true" />
                          <span className="truncate">{board}</span>
                        </span>
                      ) : null}
                      <span className="truncate text-xs text-content-tertiary md:hidden">{mobileSubline}</span>
                    </span>
                  </button>
                </TableCell>
                <TableCell className={cn(MD, FIT)}>
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
                <TableCell className={cn(MD, FIT)}>
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
                  {isOwner && r.noticeConsent ? <span className="ml-2"><NoticeConsentBadge /></span> : null}
                </TableCell>
                <TableCell className={cn(FIT, 'text-right md:text-left')}>
                  <PortalBadge status={r.portalStatus} />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </Section>
  );
}
