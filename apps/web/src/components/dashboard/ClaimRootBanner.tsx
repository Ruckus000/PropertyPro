'use client';

/**
 * Dashboard nudge for an admin-tier member of a community that has no root
 * manager yet (role-v3 Phase 2b). Shows when `useMyRootless` returns at least
 * one rootless community and the member hasn't dismissed it this session.
 *
 * **Admin-tier gate:** the fetch is gated on `isAdmin` (passed by the dashboard
 * shell). A resident must NEVER fire `useMyRootless` — their list is always
 * empty, so we skip the query entirely by disabling it.
 *
 * Dismissal is per-session (sessionStorage key `claim-root-dismissed`) — a
 * lighter touch than the persisted "finish your site" banner, since claiming
 * root is a one-time action.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShieldQuestion, X } from 'lucide-react';
import { useMyRootless } from '@/hooks/use-claim-root';

const DISMISS_KEY = 'claim-root-dismissed';

interface Props {
  /** True when the current member is admin-tier in this community. */
  isAdmin: boolean;
}

export function ClaimRootBanner({ isAdmin }: Props) {
  // Only admins ever fetch — residents skip the query entirely.
  const { data: rootless } = useMyRootless(isAdmin);

  // Per-session dismissal. Start dismissed=true until we've read sessionStorage
  // on mount (SSR has no sessionStorage; avoids a hydration flash).
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
  }, []);

  if (!isAdmin || dismissed) return null;
  if (!rootless || rootless.length === 0) return null;

  const handleDismiss = () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    setDismissed(true);
  };

  return (
    <div
      role="status"
      data-testid="claim-root-banner"
      className="flex items-start gap-3 rounded-md border border-accent/40 bg-accent/10 p-4"
    >
      <ShieldQuestion className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
      <div className="flex-1">
        <p className="text-sm font-medium text-content">
          This community has no root manager — claim it?
        </p>
        <p className="mt-1 text-sm text-content-secondary">
          A root manager owns role management for the community. Claim it to take
          ownership; other managers will be notified.
        </p>
        <Link
          href="/dashboard/claim-root"
          className="mt-2 inline-block text-sm font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
        >
          Review and claim
        </Link>
      </div>
      <button
        type="button"
        data-testid="claim-root-banner-dismiss"
        aria-label="Dismiss"
        onClick={handleDismiss}
        className="shrink-0 self-start rounded-md p-1 text-content-secondary hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-interactive"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
