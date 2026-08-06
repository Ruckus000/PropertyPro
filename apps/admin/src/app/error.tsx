'use client';

/**
 * Route-level error boundary for the operator console.
 *
 * Before this existed, every server-side throw in apps/admin — including the
 * `throw new Error('Failed to load ...')` sites in site-templates and, until
 * this change, every intended 401/403 — rendered Next's unstyled default
 * screen with no retry affordance.
 *
 * Unlike global-error.tsx this renders inside the root layout, so Tailwind is
 * available.
 */
import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Operator Console
      </p>
      <h1 className="mt-3 text-2xl font-semibold text-gray-900">
        Something went wrong
      </h1>
      <p className="mt-3 max-w-md text-sm text-gray-600">
        We couldn&apos;t load this page. Try again, and if it keeps happening
        include the reference below when reporting it.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-gray-400">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex rounded-md bg-coral-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-coral-700 focus:outline-none focus:ring-2 focus:ring-coral-500 focus:ring-offset-2"
        >
          Try again
        </button>
        <a
          href="/dashboard"
          className="inline-flex rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-coral-500 focus:ring-offset-2"
        >
          Go to dashboard
        </a>
      </div>
    </main>
  );
}
