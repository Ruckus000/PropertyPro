'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Bath, BedDouble, DollarSign, Mail, Maximize, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Avatar,
  OccupancyBadge,
  Overline,
  PortalBadge,
  avatarToneFor,
  inviteActionLabel,
} from './directory-badges';
import { OCCUPANCY_LABEL, formatCents, formatRent, plural, type DirectoryUnit } from './directory-model';

export interface UnitDetailPanelProps {
  unit: DirectoryUnit;
  communityId: number;
  hasOwnerRole: boolean;
  isAdmin: boolean;
  canSeeBalances: boolean;
  onOpenResident: (userId: string) => void;
  onAddResident: (unitId: number) => void;
  onSendInvite: (userId: string) => void;
  /** userId whose invite is in flight, to disable its button. */
  invitingUserId: string | null;
  /** Leaves room for the sheet's own close button in the header band. */
  inSheet?: boolean;
}

function StatTile({ icon: Icon, value, label }: { icon: typeof BedDouble; value: string; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-md border border-edge bg-surface-card px-3 py-2.5">
      <Icon size={18} className="shrink-0 text-content-tertiary" aria-hidden="true" />
      <span className="flex flex-col leading-tight">
        <span className="text-sm font-semibold text-content">{value}</span>
        <span className="text-xs text-content-tertiary">{label}</span>
      </span>
    </div>
  );
}

function Banner({
  tone,
  icon: Icon,
  children,
  action,
}: {
  tone: 'danger' | 'warning';
  icon: typeof AlertCircle;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-md border px-4 py-3.5',
        tone === 'danger'
          ? 'border-status-danger-border bg-status-danger-bg text-status-danger'
          : 'border-status-warning-border bg-status-warning-bg text-status-warning',
      )}
    >
      <Icon size={20} className="shrink-0" aria-hidden="true" />
      <div className="flex-1 text-sm">{children}</div>
      {action}
    </div>
  );
}

const orDash = (n: number | null) => (n === null ? '—' : String(n));

export function UnitDetailPanel({
  unit,
  communityId,
  hasOwnerRole,
  isAdmin,
  canSeeBalances,
  onOpenResident,
  onAddResident,
  onSendInvite,
  invitingUserId,
  inSheet = false,
}: UnitDetailPanelProps) {
  const rent = hasOwnerRole ? null : formatRent(unit.rentAmount);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card text-content">
      <div className="flex flex-col gap-4 border-b border-edge bg-surface-subtle px-6 py-5">
        <div className={cn('flex min-w-0 flex-col gap-1', inSheet && 'pr-10')}>
          <Overline>{unit.locationLabel}</Overline>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-2xl font-semibold leading-tight">{unit.unitNumber}</div>
            <OccupancyBadge occupancy={unit.occupancy} confirmed={unit.occupancyConfirmed} />
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(104px,1fr))] gap-2">
          <StatTile icon={BedDouble} value={orDash(unit.bedrooms)} label="Bedrooms" />
          <StatTile icon={Bath} value={orDash(unit.bathrooms)} label="Bathrooms" />
          <StatTile icon={Maximize} value={unit.sqft === null ? '—' : unit.sqft.toLocaleString('en-US')} label="Sq ft" />
          {rent ? <StatTile icon={DollarSign} value={rent} label="Rent" /> : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        {canSeeBalances && unit.pastDue ? (
          <Banner
            tone="danger"
            icon={AlertCircle}
            action={
              <Link
                href={`/communities/${communityId}/payments?tab=delinquency`}
                className="inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-md border border-status-danger-border bg-surface-card px-3 text-xs font-semibold text-status-danger hover:bg-status-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                View ledger
              </Link>
            }
          >
            <strong className="block text-base font-semibold">{formatCents(unit.pastDue.amountCents)} past due</strong>
            <span className="text-xs">Oldest charge {plural(unit.pastDue.daysOverdue, 'day')} overdue</span>
          </Banner>
        ) : null}

        {canSeeBalances && unit.overdueBelowRule ? (
          <p className="text-sm text-content-secondary">
            {formatCents(unit.overdueBelowRule.amountCents)} overdue — under your past-due rule, so not flagged.
          </p>
        ) : null}

        {unit.noOwner ? (
          <Banner tone="warning" icon={AlertTriangle}>
            <strong className="font-semibold">No owner on file.</strong> Owner records are required for voting and
            statutory notices.
          </Banner>
        ) : null}

        {unit.occupancy && !unit.occupancyConfirmed ? (
          <p className="text-xs text-content-tertiary">
            &ldquo;{OCCUPANCY_LABEL[unit.occupancy]}&rdquo;
            was estimated from who is on file and has not been confirmed by a manager yet.
          </p>
        ) : null}

        {isAdmin ? (
          <section className="flex flex-col gap-2.5" aria-label="Residents">
            <div className="flex items-center justify-between">
              <Overline>Residents · {unit.residents.length}</Overline>
              <button
                type="button"
                onClick={() => onAddResident(unit.id)}
                className="inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-content-link hover:bg-interactive-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                <Plus size={14} aria-hidden="true" />
                Add resident
              </button>
            </div>
            {unit.occupantLine ? (
              <p className={cn('text-sm', unit.hasContradiction ? 'text-status-warning' : 'text-content-secondary')}>
                {unit.occupantLine}
              </p>
            ) : null}
            {unit.residents.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {unit.residents.map((r) => (
                  <li key={r.userId} className="flex flex-col gap-3 rounded-md border border-edge p-3.5">
                    <div className="flex items-center gap-3">
                      <Avatar initials={r.initials} tone={avatarToneFor(r.isUnitOwner, hasOwnerRole)} size="lg" />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => onOpenResident(r.userId)}
                          className="text-left text-sm font-semibold text-content hover:text-content-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        >
                          {r.displayName}
                        </button>
                        <div className="truncate text-xs text-content-secondary" title={r.email ?? undefined}>
                          {hasOwnerRole ? (r.isUnitOwner ? 'Owner' : 'Tenant') : 'Tenant'}
                          {r.email ? ` · ${r.email}` : ''}
                        </div>
                      </div>
                      <PortalBadge status={r.portalStatus} />
                    </div>
                    {r.portalStatus !== 'active' ? (
                      <div className="flex flex-wrap gap-1.5 pl-12">
                        <button
                          type="button"
                          onClick={() => onSendInvite(r.userId)}
                          disabled={invitingUserId === r.userId}
                          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-edge bg-surface-card px-3 text-xs font-medium text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
                        >
                          <Mail size={14} aria-hidden="true" />
                          {invitingUserId === r.userId ? 'Sending…' : inviteActionLabel(r.portalStatus)}
                        </button>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
