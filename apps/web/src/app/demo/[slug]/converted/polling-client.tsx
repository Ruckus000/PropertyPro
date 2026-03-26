'use client';

/**
 * PollingClient — Client component for State 2 (webhook pending).
 *
 * Polls by calling router.refresh() at 5s intervals for up to 60s.
 * When the server re-renders and the demo is no longer is_demo=true,
 * the parent server component will render State 4 (conversion complete)
 * instead of this polling client.
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

const POLL_INTERVAL_MS = 5_000;
const MAX_POLL_MS = 60_000;

export function PollingClient() {
  const router = useRouter();
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (timedOut) return;

    const startTime = Date.now();

    const interval = setInterval(() => {
      if (Date.now() - startTime >= MAX_POLL_MS) {
        clearInterval(interval);
        setTimedOut(true);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [router, timedOut]);

  if (timedOut) {
    return (
      <div className="text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--status-warning-bg)]">
          <svg className="h-8 w-8 text-[var(--status-warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <h1 className="mb-3 text-2xl font-semibold text-[var(--text-primary)]">
          This is taking longer than expected
        </h1>
        <p className="text-base text-[var(--text-secondary)]">
          Check your email for login instructions. Your community will be ready shortly.
        </p>
      </div>
    );
  }

  return (
    <div className="text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--status-brand-bg)]">
        <Loader2 className="h-8 w-8 animate-spin text-[var(--status-brand)]" aria-hidden="true" />
      </div>
      <h1 className="mb-3 text-2xl font-semibold text-[var(--text-primary)]">
        Setting up your community…
      </h1>
      <p className="text-base text-[var(--text-secondary)]">
        This usually takes a few seconds. Please don't close this page.
      </p>
    </div>
  );
}
