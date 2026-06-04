'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@/lib/supabase/client';
import { resolveHomeDestination } from '@/lib/utils/home-destination';

interface RootErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: RootErrorProps) {
  // Default to `/`, which is already correct for anonymous viewers and
  // logged-in users on a community subdomain (middleware redirects `/` to
  // their dashboard). We refine it below once we know the auth state — the
  // one case `/` gets wrong is a logged-in PM admin on the pm. subdomain.
  const [homeHref, setHomeHref] = useState('/');

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  useEffect(() => {
    let active = true;
    // Wrapped in try/catch: an error boundary must never throw while rendering
    // its fallback. On any failure we keep the safe `/` default.
    void (async () => {
      try {
        const { data } = await createBrowserClient().auth.getSession();
        if (active) {
          setHomeHref(
            resolveHomeDestination({
              isLoggedIn: Boolean(data.session),
              hostname: window.location.hostname,
            }),
          );
        }
      } catch {
        /* keep the safe default '/' */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-content-link">
        PropertyPro Florida
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-content">Something went wrong</h1>
      <p className="mt-3 text-sm text-content-secondary">
        We couldn&apos;t load this page. Please try again.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
        >
          Try again
        </button>
        {/* Full navigation (real anchor, not router push) so the errored React
            tree is torn down and middleware re-runs. `homeHref` is resolved
            from auth state + host above; `/` is the safe default. */}
        <a
          href={homeHref}
          className="inline-flex rounded-md border border-border-default px-4 py-2 text-sm font-medium text-content hover:bg-surface-hover"
        >
          Go home
        </a>
      </div>
    </main>
  );
}
