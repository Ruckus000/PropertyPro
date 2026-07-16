/**
 * Client-side instrumentation for apps/admin.
 *
 * Replaces the legacy sentry.client.config.ts: Sentry stays a deferred
 * dynamic import (kept out of the critical bundle), and the
 * `onRouterTransitionStart` hook drives the global navigation progress bar.
 * Uses NEXT_PUBLIC_SENTRY_DSN; Sentry is disabled entirely when unset.
 */
import { dispatchNavigationStart } from '@/lib/navigation-progress-event';

type SentryBrowserModule = typeof import('@sentry/nextjs');

const clientDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
let sentryClientPromise: Promise<SentryBrowserModule> | null = null;

function loadSentryClient(): Promise<SentryBrowserModule> | null {
  if (!clientDsn) {
    return null;
  }

  if (!sentryClientPromise) {
    sentryClientPromise = import('@sentry/nextjs');
  }

  return sentryClientPromise;
}

async function initClientInstrumentation(): Promise<void> {
  const Sentry = await loadSentryClient();
  if (!Sentry) {
    return;
  }

  try {
    Sentry.init({
      dsn: clientDsn,
      enabled: true,

      // Performance tracing
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    });
  } catch (error) {
    console.error('[Sentry] Failed to initialize admin client instrumentation', error);
  }
}

if (clientDsn) {
  void initClientInstrumentation();
}

export function onRouterTransitionStart(
  ...args: Parameters<SentryBrowserModule['captureRouterTransitionStart']>
): void {
  // Synchronous: drives the global NavigationProgress bar even when Sentry
  // is disabled or still loading.
  dispatchNavigationStart();

  const SentryPromise = loadSentryClient();
  if (!SentryPromise) {
    return;
  }

  void SentryPromise
    .then((Sentry) => {
      Sentry.captureRouterTransitionStart(...args);
    })
    .catch((error) => {
      console.error('[Sentry] Failed to capture router transition', error);
    });
}
