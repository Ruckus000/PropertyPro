'use client';

/**
 * Last-resort error boundary for the operator console.
 *
 * This boundary REPLACES the root layout, so globals.css / Tailwind may not be
 * loaded — every color and size below must be a literal inline value. Ported
 * from apps/web's global-error.tsx, which carries the same constraint.
 */
import * as Sentry from '@sentry/nextjs';
import React, { useEffect } from 'react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          margin: 0,
          minHeight: '100vh',
          display: 'grid',
          placeItems: 'center',
          padding: '2rem',
          backgroundColor: '#111827', // design-tokens:exempt — root layout (and globals.css) may not be loaded here
          color: '#f9fafb', // design-tokens:exempt — root layout (and globals.css) may not be loaded here
        }}
      >
        <main id="main-content" style={{ textAlign: 'center', maxWidth: '36rem' }}>
          <p
            style={{
              fontSize: '0.75rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              color: '#9ca3af', // design-tokens:exempt — root layout (and globals.css) may not be loaded here
              margin: '0 0 0.5rem',
            }}
          >
            Operator Console
          </p>
          <h1 style={{ marginBottom: '1rem' }}>Something went wrong</h1>
          <p
            style={{ marginBottom: '1.5rem', color: '#d1d5db' }} // design-tokens:exempt — root layout (and globals.css) may not be loaded here
          >
            An unexpected error occurred. Please try again.
          </p>
          {error.digest && (
            <p
              style={{
                marginBottom: '1.5rem',
                fontSize: '0.75rem',
                fontFamily: 'ui-monospace, monospace',
                color: '#6b7280', // design-tokens:exempt — root layout (and globals.css) may not be loaded here
              }}
            >
              Reference: {error.digest}
            </p>
          )}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.75rem',
              justifyContent: 'center',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '0.5rem 1.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #374151', // design-tokens:exempt — root layout (and globals.css) may not be loaded here
                backgroundColor: '#1f2937', // design-tokens:exempt — root layout (and globals.css) may not be loaded here
                color: 'inherit',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Try again
            </button>
            {/* Static link only: this boundary may render with broken CSS/JS,
                so no router or auth detection here. */}
            <a
              href="/dashboard"
              style={{
                padding: '0.5rem 1.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #374151', // design-tokens:exempt — root layout (and globals.css) may not be loaded here
                backgroundColor: '#1f2937', // design-tokens:exempt — root layout (and globals.css) may not be loaded here
                color: 'inherit',
                textDecoration: 'none',
                fontSize: '0.875rem',
              }}
            >
              Go to dashboard
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
