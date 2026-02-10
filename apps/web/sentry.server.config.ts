/**
 * Sentry server-side configuration.
 *
 * This runs in the Node.js runtime. Uses SENTRY_DSN (server-side env var).
 * Redacts sensitive headers before sending events to Sentry.
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: !!process.env.SENTRY_DSN,

  // Performance tracing
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  beforeSend(event) {
    // Redact sensitive headers [acceptance criteria]
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
      delete event.request.headers['x-api-key'];
    }
    return event;
  },
});
