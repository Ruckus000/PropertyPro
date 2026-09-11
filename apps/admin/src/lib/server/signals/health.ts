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
 * The health provider sits FIRST in `buildDefaultProviders`, which makes it the
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
import { DEFAULT_ERROR_SPIKE_THRESHOLD } from '@/lib/preferences/alert-prefs';
import type { SignalProvider } from './types';

/** How many Sentry issues reach the tray before it stops being a tray. */
const TRAY_ISSUE_LIMIT = 3;

/**
 * Build the health provider for one operator's error-spike threshold.
 *
 * A FACTORY rather than a constant provider because the threshold is now
 * per-admin (wave 4), while everything else this provider reads is global. The
 * default is `DEFAULT_ERROR_SPIKE_THRESHOLD`, imported rather than re-typed so
 * the "no preferences row" path cannot drift from the preference vocabulary's
 * own default — and that default is load-bearing: this runs on every console
 * render, long before anyone has opened Settings, and must behave exactly as
 * the hardcoded `ERRORS_PER_HOUR_THRESHOLD = 10` it replaces.
 *
 * Note what is and is not per-admin. The REPORT is global — six outbound probes
 * and three privileged reads about the platform, identical for every operator —
 * so it stays behind the shared `withHealthCache` and is read here, not
 * rebuilt. Only the DERIVATION is personal: `deriveCritical` is pure and runs on
 * the cached report after it comes back. Caching the derived banner instead
 * would hand one operator's threshold to the next one through the cache.
 */
export function createHealthSignals(
  errorsPerHour: number = DEFAULT_ERROR_SPIKE_THRESHOLD,
): SignalProvider {
  return {
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
        critical: deriveCritical(report, { errorsPerHour }),
      };
    },
  };
}

/**
 * The default-threshold instance.
 *
 * Kept as a named export because it is what a caller with no operator in hand
 * wants, and because `createHealthSignals()` with no argument is the exact
 * pre-wave-4 behaviour — which is the property its tests pin.
 */
export const healthSignals: SignalProvider = createHealthSignals();
