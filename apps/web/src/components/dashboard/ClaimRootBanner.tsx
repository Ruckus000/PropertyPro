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
import { Button } from '@/components/ui/button';
import { AlertBanner } from '@/components/shared/alert-banner';
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
    <AlertBanner
      role="status"
      data-testid="claim-root-banner"
      status="brand"
      title="This community has no root manager — claim it?"
      description="A root manager owns role management for the community. Claim it to take ownership; other managers will be notified."
      action={
        <Button asChild size="sm">
          <Link href="/dashboard/claim-root">Review and claim</Link>
        </Button>
      }
      dismissible
      onDismiss={handleDismiss}
      dismissButtonProps={
        { 'data-testid': 'claim-root-banner-dismiss' } as React.ButtonHTMLAttributes<HTMLButtonElement>
      }
    />
  );
}
