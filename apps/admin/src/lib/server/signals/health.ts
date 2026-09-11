/**
 * Platform health as a shell signal: the nav badge, tray rows, and the one
 * banner the whole console can be interrupted by (spec D11/D20).
 *
 * The badge counts FAILED JOBS, not degraded services. A count is a queue of
 * things an operator can act on, and a failed cron row has a `Retry` button
 * behind it; a degraded service has no action, so counting it would inflate the
 * badge with work nobody can do. Degraded and down services still appear in the
 * tray, where a row is information rather than a task.
 *
 * `healthSignals` sits FIRST in `DEFAULT_PROVIDERS`, which makes it the
 * highest-priority source of `critical` — `getShellSignals` keeps the first
 * non-null one. That ordering is deliberate: a platform-wide error spike
 * outranks a billing problem, which outranks an unanswered email.
 *
 * This provider is allowed to THROW. `getShellSignals` settles every provider
 * and reports a rejection to Sentry, so a health read that fails leaves the rest
 * of the shell intact — which is why `getHealthReport` swallowing its own probe
 * failures is correct and this file adds no second layer of catching.
 *
 * ## The report is READ THROUGH A CACHE here, and only here
 *
 * `getShellSignals()` is awaited by the `(console)` layout, so this `load()`
 * runs on every page navigation, and again on every 60-second poll of
 * `/api/admin/shell/signals`. `getHealthReport()` is six outbound probes and
 * three privileged reads, so uncached that is ~60 Resend, ~60 Sentry and ~60
 * Stripe calls an hour per open tab plus up to four seconds on every render.
 * `withHealthCache` bounds it at one probe set per minute per process; see
 * `health-cache.ts` for why sixty seconds and for why the `/health` page and
 * `GET /api/admin/health` deliberately bypass it.
 *
 * A cache MISS still propagates a failure, because the cache does not store
 * rejections — so the throwing contract above is unchanged.
 *
 * @module lib/server/signals/health
 */
import { deriveCritical, getHealthReport } from '../health';
import { withHealthCache } from '../health-cache';
import type { SignalProvider } from './types';

/**
 * Errors per hour that earn a console-wide banner.
 *
 * Wave 4 replaces this constant with the admin's own stored preference; until
 * then it is one number in one place rather than a literal inside
 * `deriveCritical`, which has to stay pure to be testable.
 */
const ERRORS_PER_HOUR_THRESHOLD = 10;

/** How many Sentry issues reach the tray before it stops being a tray. */
const TRAY_ISSUE_LIMIT = 3;

export const healthSignals: SignalProvider = {
  key: 'health',
  async load() {
    const report = await withHealthCache(() => getHealthReport());

    const serviceItems = report.services
      .filter((service) => service.state === 'degraded' || service.state === 'down')
      .map((service) => ({
        id: `service-${service.name}`,
        tone: (service.state === 'down' ? 'danger' : 'warning') as 'danger' | 'warning',
        icon: 'activity' as const,
        title: `${service.name} is ${service.state}`,
        meta: service.short,
        href: '/health',
        // The probe has no event time of its own — it is a reading, not an
        // occurrence — so the reading's own timestamp is the honest value.
        occurredAt: report.checkedAt,
      }));

    // `errors === null` means Sentry was never asked (or refused), which is not
    // a finding and must not become a tray row. `?? []` keeps that case empty
    // rather than inventing "Sentry is quiet".
    const errorItems = (report.errors ?? []).slice(0, TRAY_ISSUE_LIMIT).map((issue) => ({
      id: `sentry-${issue.id}`,
      tone: 'danger' as const,
      icon: 'bug' as const,
      title: issue.title,
      meta: `${issue.count} events · ${issue.culprit || 'unknown location'}`,
      href: '/health',
      occurredAt: issue.lastSeen || report.checkedAt,
    }));

    return {
      count: report.jobs.length,
      items: [...serviceItems, ...errorItems],
      critical: deriveCritical(report, { errorsPerHour: ERRORS_PER_HOUR_THRESHOLD }),
    };
  },
};
