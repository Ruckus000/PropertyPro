'use client';

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
        }}
      >
        <main
          style={{
            textAlign: 'center',
            maxWidth: '36rem',
          }}
        >
          <h1 style={{ marginBottom: '1rem' }}>Something went wrong</h1>
          <p style={{ marginBottom: '1.5rem', color: '#4b5563' }}>
            An unexpected error occurred. Please try again.
          </p>
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
                border: '1px solid #d1d5db',
                backgroundColor: '#fff',
                cursor: 'pointer',
                fontSize: '0.875rem',
              }}
            >
              Try again
            </button>
            {/* Static link only: this last-resort boundary may render with
                broken CSS/JS, so no auth detection here. `/` lands community
                subdomain users on their dashboard and everyone else on the
                public/marketing landing. */}
            <a
              href="/"
              style={{
                padding: '0.5rem 1.5rem',
                borderRadius: '0.375rem',
                border: '1px solid #d1d5db',
                backgroundColor: '#fff',
                color: 'inherit',
                textDecoration: 'none',
                fontSize: '0.875rem',
              }}
            >
              Go home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
