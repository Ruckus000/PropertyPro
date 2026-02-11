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
        </main>
      </body>
    </html>
  );
}
