'use client';

/**
 * A unit's lease status. Calm states (Leased, Month-to-month, Pre-leased) read
 * as plain text with a small dot so the rows that need attention — Expiring,
 * Ending, Holdover, Vacant, Offline — are the only ones with a badge. Never
 * colour alone: every state has its text, and badges carry an icon too
 * (DESIGN.md).
 */
import { AlertTriangle, Circle, Clock, PauseCircle, XCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { StatusLabel } from '@/lib/leases/roster-model';

const CALM_DOT: Partial<Record<StatusLabel, string>> = {
  Leased: 'bg-status-success',
  'Month-to-month': 'bg-status-info',
  'Pre-leased': 'bg-status-info',
};

const BADGE: Partial<Record<StatusLabel, { className: string; icon: LucideIcon }>> = {
  Expiring: { className: 'bg-status-warning-bg text-status-warning border-status-warning-border', icon: Clock },
  Ending: { className: 'bg-status-warning-bg text-status-warning border-status-warning-border', icon: Clock },
  Holdover: { className: 'bg-status-danger-bg text-status-danger border-status-danger-border', icon: AlertTriangle },
  Vacant: { className: 'bg-status-neutral-bg text-content-secondary border-edge', icon: Circle },
  Offline: { className: 'bg-status-neutral-bg text-content-secondary border-edge', icon: PauseCircle },
};

export function LeaseStatus({ status, className }: { status: StatusLabel; className?: string }) {
  const dot = CALM_DOT[status];
  if (dot) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-sm text-content', className)}>
        <span aria-hidden="true" className={cn('size-1.5 rounded-full', dot)} />
        {status}
      </span>
    );
  }
  const badge = BADGE[status] ?? { className: 'bg-status-neutral-bg text-content-secondary border-edge', icon: XCircle };
  const Icon = badge.icon;
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium',
        badge.className,
        className,
      )}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {status}
    </span>
  );
}
