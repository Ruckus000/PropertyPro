/**
 * Client-side instrumentation for apps/admin.
 *
 * Replaces the legacy sentry.client.config.ts: Sentry stays a deferred
 * dynamic import (kept out of the critical bundle), and the
 * `onRouterTransitionStart` hook drives the global navigation progress bar.
 * Uses NEXT_PUBLIC_SENTRY_DSN; Sentry is disabled entirely when unset.
 */
import { dispatchNavigationStart } from '@/lib/navigation-progress-event';
import { scrubBrowserEvent } from '@propertypro/shared/observability';

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

      // Keeps browser events separable from apps/web inside the shared
      // `property-pro` Sentry project. See sentry.server.config.ts for why one
      // project rather than two.
      initialScope: { tags: { app: 'admin' } },


      // Browser events carry secrets the SERVER hook cannot reach. Copying the
      // server's header-deleting beforeSend here would be a no-op — browsers do
      // not populate event.request.headers. What they do populate is the URL,
      // the query string and every fetch/xhr breadcrumb URL, and admin's demo
      // previews put an HMAC login token in exactly there.
      beforeSend: (event) => scrubBrowserEvent(event),

      // `beforeSend` fires for ERROR events only. Transactions carry
      // `request.url` too and are sampled at 10% in production, so without
      // this a secret-bearing URL ships unscrubbed through the tracing
      // pipeline while the error pipeline looks covered.
      beforeSendTransaction: (event) => scrubBrowserEvent(event),

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
