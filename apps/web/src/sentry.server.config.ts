/**
 * Sentry server-side configuration.
 *
 * This runs in the Node.js runtime. Uses SENTRY_DSN (server-side env var).
 * Redacts sensitive headers before sending events to Sentry.
 */
import * as Sentry from '@sentry/nextjs';
import type { ErrorEvent } from '@sentry/nextjs';

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

/**
 * Strip user data out of an event before it leaves the process.
 *
 * Exported so it can be tested: this is a privacy control, and a control that
 * only exists inside a module-scope `Sentry.init` call cannot be asserted.
 *
 * THE PARAMS CASE IS NOT HYPOTHETICAL. drizzle-orm builds its error message as
 * `Failed query: <sql>\nparams: <bound values>` (drizzle-orm/errors.js:11-15),
 * so ANY query failure carries every bound value in `exception.values[].value`
 * — for a support-inbox insert that is the sender's address, subject and full
 * message body. Sentry retains events for 30-90 days depending on plan, so a
 * single database blip would put third-party correspondence somewhere it was
 * never meant to be, on a clock nobody is watching.
 *
 * The SQL is KEPT. It is what makes the report useful and it contains no user
 * data; only the values after `params:` are dropped.
 */
export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  // Redact sensitive headers [acceptance criteria]
  if (event.request?.headers) {
    delete event.request.headers['authorization'];
    delete event.request.headers['cookie'];
    delete event.request.headers['x-api-key'];
  }

  for (const entry of event.exception?.values ?? []) {
    const marker = entry.value?.indexOf('params: ');
    if (entry.value && marker !== undefined && marker >= 0) {
      entry.value = `${entry.value.slice(0, marker)}params: [redacted]`;
    }
  }

  return event;
}

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
  initialScope: { tags: { app: 'web' } },

  // Performance tracing
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

  beforeSend: scrubSentryEvent,
});
