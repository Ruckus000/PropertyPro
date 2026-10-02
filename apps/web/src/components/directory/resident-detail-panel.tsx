'use client';

import { ArrowLeftRight, Mail, Pencil, Phone, Send, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, Overline, PORTAL_DETAIL, avatarToneFor, inviteActionLabel } from './directory-badges';
import type { DirectoryResidentRow } from './directory-model';

export interface ResidentDetailPanelProps {
  resident: DirectoryResidentRow;
  hasOwnerRole: boolean;
  onOpenUnit: (unitId: number) => void;
  onSendInvite: (userId: string) => void;
  inviting: boolean;
  onEdit: () => void;
  onRemove: () => void;
  /** Omitted without documents:write. */
  onSendDocuments?: () => void;
  inSheet?: boolean;
}

const DESIGNATION_LABEL = {
  board_president: 'Board president',
  board_member: 'Board member',
} as const;

const PORTAL_CARD: Record<DirectoryResidentRow['portalStatus'], string> = {
  active: 'border-status-success-border bg-status-success-bg text-status-success',
  invited: 'border-status-info-border bg-status-info-bg text-status-info',
  not_invited: 'border-edge bg-surface-muted text-content-secondary',
};

export function ResidentDetailPanel({
  resident,
  hasOwnerRole,
  onOpenUnit,
  onSendInvite,
  inviting,
  onEdit,
  onRemove,
  onSendDocuments,
  inSheet = false,
}: ResidentDetailPanelProps) {
  const tone = avatarToneFor(resident.isUnitOwner, hasOwnerRole);
  const typeLabel = hasOwnerRole && resident.isUnitOwner ? 'Owner' : 'Tenant';
  const board = resident.designation ? DESIGNATION_LABEL[resident.designation] : null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface-card text-content">
      <div className={cn('flex items-start gap-3.5 border-b border-edge bg-surface-subtle px-6 py-5', inSheet && 'pr-14')}>
        <Avatar initials={resident.initials} tone={tone} size="xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="text-xl font-semibold leading-tight">{resident.displayName}</div>
          <div className="flex flex-wrap items-center gap-2 text-sm text-content-secondary">
            <span
              className={cn(
                'inline-flex h-6 items-center rounded-full px-2 text-xs font-medium',
                tone === 'owner' ? 'bg-interactive-subtle text-content-brand' : 'bg-status-info-bg text-status-info',
              )}
            >
              {typeLabel}
            </span>
            {resident.unit ? (
              <button
                type="button"
                onClick={() => onOpenUnit(resident.unit!.id)}
                className="font-medium text-content-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
              >
                Unit {resident.unit.unitNumber}
                <span className="sr-only">, {resident.unit.locationLabel}</span>
              </button>
            ) : (
              <span>No unit</span>
            )}
            {board ? <span>· {board}</span> : null}
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        <div className={cn('flex items-center gap-3 rounded-md border px-4 py-3.5', PORTAL_CARD[resident.portalStatus])}>
          <div className="flex flex-1 flex-col gap-0.5">
            <Overline>Portal access</Overline>
            <span className="text-sm font-medium">{PORTAL_DETAIL[resident.portalStatus]}</span>
          </div>
          {resident.portalStatus !== 'active' ? (
            <button
              type="button"
              onClick={() => onSendInvite(resident.userId)}
              disabled={inviting}
              className="inline-flex h-10 shrink-0 items-center whitespace-nowrap rounded-md border border-edge bg-surface-card px-3.5 text-xs font-medium text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-60"
            >
              {inviting ? 'Sending…' : inviteActionLabel(resident.portalStatus)}
            </button>
          ) : null}
        </div>

        <section className="flex flex-col gap-2.5" aria-label="Contact">
          <Overline>Contact</Overline>
          <div className="overflow-hidden rounded-md border border-edge">
            <div className="flex min-h-12 items-center gap-3 px-3.5 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-surface-muted">
                <Mail size={16} className="text-content-secondary" aria-hidden="true" />
              </span>
              <span className="truncate text-sm" title={resident.email ?? undefined}>
                {resident.email ?? 'No email on file'}
              </span>
            </div>
            <div className="flex min-h-12 items-center gap-3 border-t border-edge px-3.5 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-surface-muted">
                <Phone size={16} className="text-content-secondary" aria-hidden="true" />
              </span>
              <span className={cn('text-sm tabular-nums', !resident.phone && 'text-content-tertiary')}>
                {resident.phone ?? 'No phone on file'}
              </span>
            </div>
          </div>
        </section>

        <section className="flex flex-col gap-2.5" aria-label="Board">
          <Overline>Board</Overline>
          <div className="text-sm">{board ?? 'Not on the board'}</div>
          <div className="text-xs text-content-tertiary">Board designations are managed in Roles &amp; access.</div>
        </section>

        <div className="flex flex-col overflow-hidden rounded-md border border-edge">
          {onSendDocuments ? (
            <button
              type="button"
              onClick={onSendDocuments}
              className="flex min-h-12 items-center gap-3 border-b border-edge px-3.5 text-left text-sm font-medium text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
            >
              <Send size={16} className="text-content-tertiary" aria-hidden="true" />
              Send documents
            </button>
          ) : null}
          <button
            type="button"
            onClick={onEdit}
            className="flex min-h-12 items-center gap-3 border-b border-edge px-3.5 text-left text-sm font-medium text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
          >
            <Pencil size={16} className="text-content-tertiary" aria-hidden="true" />
            Edit details
          </button>
          <button
            type="button"
            onClick={onEdit}
            className="flex min-h-12 items-center gap-3 border-b border-edge px-3.5 text-left text-sm font-medium text-content hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
          >
            <ArrowLeftRight size={16} className="text-content-tertiary" aria-hidden="true" />
            Move to another unit
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="flex min-h-12 items-center gap-3 px-3.5 text-left text-sm font-medium text-status-danger hover:bg-status-danger-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
          >
            <Trash2 size={16} aria-hidden="true" />
            Remove from community
          </button>
        </div>
      </div>
    </div>
  );
}
