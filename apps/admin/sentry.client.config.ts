/**
 * Sentry client-side configuration for apps/admin.
 *
 * Runs in the browser. Uses NEXT_PUBLIC_SENTRY_DSN (public env var).
 */
const clientDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

async function initClientSentry(): Promise<void> {
  if (!clientDsn) {
    return;
  }

  const Sentry = await import('@sentry/nextjs');

  Sentry.init({
    dsn: clientDsn,
    enabled: true,

    // Performance tracing
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  });
}

if (clientDsn) {
  void initClientSentry().catch((error) => {
    console.error('[Sentry] Failed to initialize admin client instrumentation', error);
  });
}
