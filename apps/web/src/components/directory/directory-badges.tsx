'use client';

import type { ReactNode } from 'react';
import { MailCheck } from 'lucide-react';
import { NOTICE_CONSENT_RECORD_ONLY_NOTE } from '@propertypro/shared';
import { StatusBadge } from '@/components/shared/status-badge';
import { cn } from '@/lib/utils';
import type { UnitOccupancy } from '@/hooks/use-units';
import type { ResidentPortalStatus } from '@/hooks/use-residents-management';
import { OCCUPANCY_LABEL } from './directory-model';

// Directory states mapped onto the shared STATUS_CONFIG keys (which carry the
// colour + icon); the label is always overridden with Directory wording.
const OCCUPANCY_STATUS: Record<UnitOccupancy, string> = {
  vacant: 'pending',
  rented: 'open',
  owner_occupied: 'brand',
};

const PORTAL_STATUS: Record<ResidentPortalStatus, { key: string; label: string }> = {
  active: { key: 'completed', label: 'Active' },
  invited: { key: 'open', label: 'Invited' },
  not_invited: { key: 'neutral', label: 'Not invited' },
  no_login: { key: 'neutral', label: 'No login' },
};

/**
 * An unconfirmed value is a backfilled guess (migration `unit_occupancy`): it renders with
 * a dashed border and says so on hover and to assistive tech.
 */
export function OccupancyBadge({
  occupancy,
  confirmed,
}: {
  occupancy: UnitOccupancy | null;
  confirmed: boolean;
}) {
  if (!occupancy) return null;
  return (
    <>
      <StatusBadge
        status={OCCUPANCY_STATUS[occupancy]}
        label={OCCUPANCY_LABEL[occupancy]}
        className={cn('shrink-0 whitespace-nowrap', !confirmed && 'border-dashed')}
        title={confirmed ? undefined : 'Estimated from who is on file — not yet confirmed by a manager'}
      />
      {confirmed ? null : <span className="sr-only">(unconfirmed)</span>}
    </>
  );
}

export function PortalBadge({ status }: { status: ResidentPortalStatus }) {
  const { key, label } = PORTAL_STATUS[status];
  return <StatusBadge status={key} label={label} className="shrink-0 whitespace-nowrap" />;
}

/** The owner has consented to electronic notice. Icon + text, never colour alone. */
export function NoticeConsentBadge() {
  const title = `Consented to official notices by email. ${NOTICE_CONSENT_RECORD_ONLY_NOTE}`;
  return (
    <span
      className="inline-flex h-6 items-center gap-1 whitespace-nowrap text-xs text-content-secondary"
      title={title}
      data-testid="notice-consent-badge"
    >
      <MailCheck size={14} className="text-content-tertiary" aria-hidden="true" />
      E-notice
      <span className="sr-only">: {title}</span>
    </span>
  );
}

export const PORTAL_DETAIL: Record<ResidentPortalStatus, string> = {
  active: 'Active — signed in to the portal',
  invited: 'Invited — has not signed in yet',
  not_invited: 'Not invited yet',
  no_login: 'Household member — no portal login',
};

/** Label for the invite action, by portal status. */
export function inviteActionLabel(status: ResidentPortalStatus): string {
  // ponytail: no action for `active` — a manager-triggered login link would be a
  // new way to send sign-in emails for someone; residents have "Forgot password".
  return status === 'invited' ? 'Resend invite' : 'Send invite';
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
