'use client';

/**
 * FreeAccessBanner — Shows community free access status in the dashboard.
 *
 * Displays contextual banners based on the free access timeline:
 *   - Info: more than 14 days remaining
 *   - Warning: 14 or fewer days remaining
 *   - Alert: free access expired but grace period active
 *   - Hidden: both expired (subscription guard handles blocking)
 */

import Link from 'next/link';
import { AlertBanner } from '@/components/shared/alert-banner';

interface FreeAccessBannerProps {
  /** When the free access period expires. Null = no free access. */
  expiresAt: Date | null;
  /** When the post-expiry grace period ends. Null = no grace period. */
  graceEndsAt?: Date | null;
}

function getDaysRemaining(target: Date): number {
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function FreeAccessBanner({ expiresAt, graceEndsAt }: FreeAccessBannerProps) {
  if (!expiresAt) return null;

  const now = new Date();
  const isActive = expiresAt > now;
  const isInGrace = !isActive && graceEndsAt && graceEndsAt > now;

  const subscribeAction = (
    <Link
      href="/settings/billing"
      className="shrink-0 rounded-md border border-current px-3 py-1 text-sm font-medium transition-opacity duration-micro hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      Subscribe
    </Link>
  );

  if (isActive) {
    const days = getDaysRemaining(expiresAt);

    if (days > 14) {
      return (
        <AlertBanner
          status="info"
          variant="subtle"
          title={`Free access \u2014 ${days} days remaining`}
          action={subscribeAction}
        />
      );
    }

    return (
      <AlertBanner
        status="warning"
        variant="filled"
        title={`Free access expires in ${days} day${days === 1 ? '' : 's'}. Subscribe to continue.`}
        action={subscribeAction}
      />
    );
  }

  if (isInGrace) {
    return (
      <AlertBanner
        status="danger"
        variant="filled"
        title="Free access has ended. Subscribe now to avoid losing access."
        action={subscribeAction}
      />
    );
  }

  // Both expired — subscription guard handles blocking
  return null;
}
