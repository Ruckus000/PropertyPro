'use client';

/**
 * HealthFreshness — "Checked Ns ago", plus the revalidation that keeps it true.
 *
 * Two triggers, and both are needed:
 *
 * - every 60 s, so a board left open on a second monitor is not lying;
 * - on window focus, because the operator coming BACK to this tab is the moment
 *   a stale reading does the most damage. A 60 s timer alone means a tab
 *   returned to after an hour still shows whatever it showed an hour ago for up
 *   to a minute.
 *
 * The age counter ticks locally every second so the label moves without a
 * network round-trip; `router.refresh()` re-runs the Server Component and the
 * probes. `checkedAt` coming back changes the key this component counts from.
 *
 * Rendered as a direct JSX child of the page rather than passed through
 * `AdminPageHeader`'s `actions` prop — a client component handed across a
 * server-component prop boundary has failed to hydrate in this repo before, and
 * a refresh button that does nothing is indistinguishable from a healthy one.
 */
import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@propertypro/ui';

const REFRESH_INTERVAL_MS = 60_000;

interface HealthFreshnessProps {
  /** ISO timestamp from `HealthReport.checkedAt`. */
  checkedAt: string;
}

function formatAge(seconds: number): string {
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

export function HealthFreshness({ checkedAt }: HealthFreshnessProps) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();
  const [ageSeconds, setAgeSeconds] = useState(0);

  const refresh = useCallback(() => {
    startTransition(() => router.refresh());
  }, [router]);

  // Recompute from `checkedAt` rather than counting up from mount, so a server
  // report that is already a few seconds old is not reported as fresh.
  useEffect(() => {
    const stamped = new Date(checkedAt).getTime();
    if (!Number.isFinite(stamped)) return;

    const tick = () => setAgeSeconds(Math.max(0, Math.round((Date.now() - stamped) / 1000)));
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [checkedAt]);

  useEffect(() => {
    const interval = window.setInterval(refresh, REFRESH_INTERVAL_MS);
    // `focus` rather than `visibilitychange`: a tab that was never hidden but
    // lost focus to another window is the same stale-reading problem.
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return (
    <div className="flex items-center gap-3">
      <p className="text-xs text-content-tertiary" aria-live="off">
        Checked {formatAge(ageSeconds)}
      </p>
      <Button size="sm" variant="ghost" onClick={refresh} disabled={isRefreshing}>
        {isRefreshing ? (
          <Loader2 size={14} aria-hidden="true" className="mr-1 animate-spin" />
        ) : (
          <RefreshCw size={14} aria-hidden="true" className="mr-1" />
        )}
        {isRefreshing ? 'Checking' : 'Check now'}
      </Button>
    </div>
  );
}
