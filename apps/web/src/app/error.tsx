'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

interface RootErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: RootErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-content-link">
        PropertyPro Florida
      </p>
      <h1 className="mt-3 text-3xl font-semibold text-content">Something went wrong</h1>
      <p className="mt-3 text-sm text-content-secondary">
        We couldn&apos;t load this page. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex rounded-md bg-interactive px-4 py-2 text-sm font-medium text-content-inverse hover:bg-interactive-hover"
      >
        Try again
      </button>
    </main>
  );
}
