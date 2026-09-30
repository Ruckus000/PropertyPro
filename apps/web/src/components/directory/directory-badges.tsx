'use client';

import type { ReactNode } from 'react';
import { CheckCircle2, Circle, Clock, Home, KeyRound, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { UnitOccupancy } from '@/hooks/use-units';
import type { ResidentPortalStatus } from '@/hooks/use-residents-management';
import { OCCUPANCY_LABEL } from './directory-model';

export type PillTone = 'danger' | 'warning' | 'success' | 'info' | 'brand' | 'neutral';

const TONE_CLASSES: Record<PillTone, string> = {
  danger: 'border-status-danger-border bg-status-danger-bg text-status-danger',
  warning: 'border-status-warning-border bg-status-warning-bg text-status-warning',
  success: 'border-status-success-border bg-status-success-bg text-status-success',
  info: 'border-status-info-border bg-status-info-bg text-status-info',
  brand: 'border-edge bg-interactive-subtle text-content-brand',
  neutral: 'border-edge bg-surface-muted text-content-secondary',
};

/** Status is never colour alone: every pill carries an icon and text. */
export function Pill({
  tone,
  icon: Icon,
  children,
  dashed = false,
  className,
  title,
}: {
  tone: PillTone;
  icon?: LucideIcon;
  children: ReactNode;
  dashed?: boolean;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2 text-xs font-medium',
        TONE_CLASSES[tone],
        dashed && 'border-dashed',
        className,
      )}
    >
      {Icon ? <Icon size={12} strokeWidth={2.5} aria-hidden="true" /> : null}
      {children}
    </span>
  );
}

const OCCUPANCY_TONE: Record<UnitOccupancy, { tone: PillTone; icon: LucideIcon }> = {
  vacant: { tone: 'warning', icon: Home },
  rented: { tone: 'info', icon: KeyRound },
  owner_occupied: { tone: 'brand', icon: Home },
};

/**
 * An unconfirmed value is a backfilled guess (migration 0080): it renders with
 * a dashed border and says so to assistive tech and on hover.
 */
export function OccupancyBadge({
  occupancy,
  confirmed,
}: {
  occupancy: UnitOccupancy | null;
  confirmed: boolean;
}) {
  if (!occupancy) return null;
  const { tone, icon } = OCCUPANCY_TONE[occupancy];
  return (
    <Pill
      tone={tone}
      icon={icon}
      dashed={!confirmed}
      title={confirmed ? undefined : 'Estimated from who is on file — not yet confirmed by a manager'}
    >
      {OCCUPANCY_LABEL[occupancy]}
      {confirmed ? null : <span className="sr-only"> (unconfirmed)</span>}
    </Pill>
  );
}

const PORTAL: Record<ResidentPortalStatus, { tone: PillTone; icon: LucideIcon; label: string }> = {
  active: { tone: 'success', icon: CheckCircle2, label: 'Active' },
  invited: { tone: 'info', icon: Clock, label: 'Invited' },
  not_invited: { tone: 'neutral', icon: Circle, label: 'Not invited' },
};

export function PortalBadge({ status }: { status: ResidentPortalStatus }) {
  const { tone, icon, label } = PORTAL[status];
  return (
    <Pill tone={tone} icon={icon}>
      {label}
    </Pill>
  );
}

export const PORTAL_DETAIL: Record<ResidentPortalStatus, string> = {
  active: 'Active — signed in to the portal',
  invited: 'Invited — has not signed in yet',
  not_invited: 'Not invited yet',
};

/** Label for the invite action, by portal status. */
export function inviteActionLabel(status: ResidentPortalStatus): string {
  return status === 'invited' ? 'Resend invite' : status === 'active' ? 'Send login link' : 'Send invite';
}

export type AvatarTone = 'owner' | 'tenant' | 'neutral';

const AVATAR_TONE: Record<AvatarTone, string> = {
  owner: 'bg-interactive-subtle text-content-brand',
  tenant: 'bg-status-info-bg text-status-info',
  neutral: 'bg-surface-muted text-content-secondary',
};

const AVATAR_SIZE = {
  sm: 'h-7 w-7 text-xs',
  md: 'h-8 w-8 text-xs',
  lg: 'h-9 w-9 text-xs',
  xl: 'h-14 w-14 text-base',
} as const;

export function Avatar({
  initials,
  tone,
  size = 'lg',
  ringed = false,
  className,
}: {
  initials: string;
  tone: AvatarTone;
  size?: keyof typeof AVATAR_SIZE;
  /** Card avatar stacks overlap; a ring in the card colour separates them. */
  ringed?: boolean;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold',
        AVATAR_SIZE[size],
        AVATAR_TONE[tone],
        ringed && 'ring-2 ring-surface-card',
        className,
      )}
    >
      {initials}
    </span>
  );
}

export function avatarToneFor(isUnitOwner: boolean, hasOwnerRole: boolean): AvatarTone {
  if (!hasOwnerRole) return 'tenant';
  return isUnitOwner ? 'owner' : 'tenant';
}

/** Uppercase section label ("Residents · 2", "Contact"). */
export function Overline({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('text-xs font-semibold uppercase tracking-wider text-content-tertiary', className)}>
      {children}
    </div>
  );
}
