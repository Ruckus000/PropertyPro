/**
 * Sentry client-side configuration.
 *
 * This is loaded in the browser. Uses NEXT_PUBLIC_SENTRY_DSN.
 * Disabled entirely when DSN is not set (local development).
 */
import { dispatchNavigationStart } from '@/lib/navigation/navigation-progress-event';
import { scrubBrowserEvent } from '@propertypro/shared/observability';

type SentryBrowserModule = typeof import('@sentry/nextjs');

const clientDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
/**
 * Deployment environment, mirroring the server/edge configs.
 *
 * `NEXT_PUBLIC_VERCEL_ENV` is injected by the platform and is the only one of
 * the pair that survives into the browser bundle. Without it every client event
 * landed unlabelled in the production project alongside developer-laptop noise.
 */
const clientEnvironment =
  process.env.NEXT_PUBLIC_VERCEL_ENV ?? process.env.NODE_ENV ?? 'development';
let sentryClientPromise: Promise<SentryBrowserModule> | null = null;

function loadSentryClient(): Promise<SentryBrowserModule> | null {
  // Local dev inherits the DSN from .env.local; skip entirely so laptop
  // errors never reach the production project (and the SDK chunk is not
  // even fetched).
  if (!clientDsn || clientEnvironment === 'development') {
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
      environment: clientEnvironment,
      enabled: true,

      // Keeps browser events separable from apps/admin inside the shared
      // `property-pro` Sentry project. See sentry.server.config.ts for why one
      // project rather than two.
      initialScope: { tags: { app: 'web' } },


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
