import { scrubServerEvent } from './scrub-server-event';

/**
 * The Sentry options every server and edge config shares (web and admin).
 * Each config spreads this and adds only its own `initialScope` app tag, which
 * stays a literal in that file because `guard:sentry-instrumentation` reads it.
 *
 * One Sentry project (`property-pro`) for both apps, told apart by that tag.
 * Deliberately one project rather than two: admin-only configuration in this
 * repo has a demonstrated habit of rotting unnoticed (no org/project set for
 * 133 days, client DSN never set at all), and a second project would add three
 * more admin-only env vars to that surface.
 *
 * Read at call time, i.e. when the config module loads, exactly as the four
 * inline copies did.
 */
export function serverSentryOptions() {
  // `VERCEL_ENV` is 'production' | 'preview' | 'development' and is injected by
  // the platform; NODE_ENV is the local fallback. Without it the production
  // project filled with `development` events from developer machines.
  const environment = process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development';

  return {
    dsn: process.env.SENTRY_DSN,
    environment,
    // A DSN alone is not enough: local dev inherits it from .env.local and
    // would otherwise report into the production project.
    enabled: !!process.env.SENTRY_DSN && environment !== 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    beforeSend: scrubServerEvent,
    // BOTH hooks. `beforeSend` fires for ERROR events only: @sentry/core's
    // `processBeforeSend` gates it on `event.type === undefined` and routes
    // transactions to `beforeSendTransaction`. A transaction carries the same
    // `event.request` an error does, so wiring only `beforeSend` scrubs half
    // the traffic at `tracesSampleRate` 0.1.
    beforeSendTransaction: scrubServerEvent,
  };
}
