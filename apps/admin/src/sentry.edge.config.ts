/**
 * Sentry edge runtime configuration for apps/admin.
 *
 * Runs in Vercel Edge Functions / middleware.
 * Same as server config with sensitive header redaction.
 */
import * as Sentry from '@sentry/nextjs';

/**
 * Deployment environment for Sentry.
 *
 * `VERCEL_ENV` is 'production' | 'preview' | 'development' and is injected by
 * the platform; NODE_ENV is the local fallback.
 *
 * Two things depended on this and neither worked before it was set:
 *   1. Nothing distinguished a production error from a laptop one, so the
 *      production project filled with `development` events from developer
 *      machines — 20 open issues, zero of them from production. Real incidents
 *      would have been buried.
 *   2. `enabled` below now requires a deployed environment, so local dev no
 *      longer reports into the shared project at all.
 */
const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment,
  // A DSN alone is not enough: local dev inherits it from .env.local and
  // would otherwise report into the production project.
  enabled: !!process.env.SENTRY_DSN && environment !== 'development',

  // Every event from this app carries `app` so admin and web stay separable
  // inside the single shared Sentry project (`property-pro`). Deliberately one
  // project rather than two: admin-only configuration in this repo has a
  // demonstrated habit of rotting unnoticed (no org/project set for 133 days,
  // client DSN never set at all), and a second project would add three more
  // admin-only env vars to that surface. `initialScope` rather than a post-init
  // setTag so the tag is present on the very first event, with no race.
  initialScope: { tags: { app: 'admin' } },

  // Performance tracing
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  beforeSend(event) {
    // Redact sensitive headers
    if (event.request?.headers) {
      delete event.request.headers['authorization'];
      delete event.request.headers['cookie'];
      delete event.request.headers['x-api-key'];
    }
    return event;
  },
});
