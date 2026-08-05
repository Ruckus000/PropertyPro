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

  // Every event from this app carries `app` so admin and web stay separable
  // inside the single shared Sentry project (`property-pro`). Deliberately one
  // project rather than two: admin-only configuration in this repo has a
  // demonstrated habit of rotting unnoticed (no org/project set for 133 days,
  // client DSN never set at all), and a second project would add three more
  // admin-only env vars to that surface. `initialScope` rather than a post-init
  // setTag so the tag is present on the very first event, with no race.
  initialScope: { tags: { app: 'web' } },

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
