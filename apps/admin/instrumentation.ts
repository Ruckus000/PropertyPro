/**
 * Next.js instrumentation hook for apps/admin.
 *
 * Conditionally imports Sentry config based on the runtime environment.
 * This file is loaded once when Next.js starts.
 */
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

/**
 * Instrument Next.js request lifecycle errors (including nested RSC failures).
 */
export const onRequestError = Sentry.captureRequestError;
