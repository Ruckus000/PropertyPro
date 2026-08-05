/**
 * Sentry client-side configuration.
 *
 * This is loaded in the browser. Uses NEXT_PUBLIC_SENTRY_DSN.
 * Disabled entirely when DSN is not set (local development).
 */
import { dispatchNavigationStart } from '@/lib/navigation/navigation-progress-event';

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

      // Keeps browser events separable from apps/admin inside the shared
      // `property-pro` Sentry project. See sentry.server.config.ts for why one
      // project rather than two.
      initialScope: { tags: { app: 'web' } },

      // Performance tracing
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

      // Session replay
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0,
    });
  } catch (error) {
    console.error('[Sentry] Failed to initialize client instrumentation', error);
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
