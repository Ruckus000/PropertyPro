/**
 * `healthSignals` — the nav badge, the tray rows, and the critical banner.
 *
 * `getHealthReport` is mocked wholesale: its probes are covered in
 * `health-probes.test.ts`, and what these cases are about is the mapping from a
 * report to shell chrome. In particular that the badge counts ACTIONABLE work
 * (failed jobs) and not degraded services, and that an unconfigured Sentry
 * contributes no tray rows at all.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { HealthReport } from '@/lib/server/health';

const getHealthReport = vi.fn<() => Promise<HealthReport>>();
vi.mock('@/lib/server/health', async (importOriginal) => {
  // `deriveCritical` is the real one — this file asserts the wiring of the
  // threshold, and a stubbed derivation could not tell whether 10 was passed.
  const actual = await importOriginal<typeof import('@/lib/server/health')>();
  return { ...actual, getHealthReport: () => getHealthReport() };
});

import { invalidateBillingCache } from '@/lib/server/billing-cache';
import { HEALTH_CACHE_TTL_MS, invalidateHealthCache } from '@/lib/server/health-cache';
import { createHealthSignals, healthSignals } from '@/lib/server/signals/health';
import { DEFAULT_ALERT_PREFS } from '@/lib/preferences/alert-prefs';

const report = (over: Partial<HealthReport> = {}): HealthReport => ({
  services: [],
  errors: null,
  jobs: [],
  errorsLastHour: 0,
  checkedAt: '2026-09-08T12:00:00Z',
  ...over,
});

const issue = (over: Record<string, unknown> = {}) => ({
  id: 'i1',
  shortId: 'PP-1',
  title: 'TypeError: boom',
  culprit: 'lib/x.ts',
  count: 4,
  lastSeen: '2026-09-08T11:59:00Z',
  permalink: 'p',
  hourly: [0, 1],
  ...over,
});

beforeEach(() => {
  // The signal provider reads THROUGH a module-level TTL cache, so without this
  // the first test's report would be served to every later one and each of them
  // would be asserting on a fixture it did not set.
  invalidateHealthCache();
  getHealthReport.mockResolvedValue(report());
});

describe('healthSignals', () => {
  it('is registered under the health nav key', () => {
    expect(healthSignals.key).toBe('health');
  });

  it('counts failed jobs, not degraded services', async () => {
    // A degraded service has no button behind it. Counting it would put work in
    // the badge that nobody can clear.
    getHealthReport.mockResolvedValue(
      report({
        services: [{ name: 'Resend', state: 'degraded', short: 'slow', meta: '' }],
        jobs: [
          { source: 'Cron', name: 'a', error: 'e', when: 'w', attempts: '1 attempt', retryable: true, slug: 'a' },
          { source: 'Stripe', name: 'evt_1', error: 'not processed', when: 'w', attempts: '—', retryable: false },
        ],
      }),
    );
    const result = await healthSignals.load();
    expect(result.count).toBe(2);
  });

  it('puts degraded and down services in the tray but not healthy ones', async () => {
    getHealthReport.mockResolvedValue(
      report({
        services: [
          { name: 'API', state: 'ok', short: 'Healthy', meta: '' },
          { name: 'Resend', state: 'degraded', short: 'HTTP 429', meta: '' },
          { name: 'Supabase', state: 'down', short: 'Unreachable', meta: '' },
          // `unknown` is "not configured", not a finding — a fresh checkout must
          // not fill the tray with its own missing env vars.
          { name: 'Stripe webhooks', state: 'unknown', short: 'Not configured', meta: '' },
        ],
      }),
    );
    const result = await healthSignals.load();
    expect(result.items.map((i) => i.title)).toEqual([
      'Resend is degraded',
      'Supabase is down',
    ]);
    expect(result.items.map((i) => i.tone)).toEqual(['warning', 'danger']);
  });

  it('adds no tray rows when Sentry is not configured', async () => {
    getHealthReport.mockResolvedValue(report({ errors: null }));
    expect((await healthSignals.load()).items).toEqual([]);
  });

  it('caps Sentry issues at three', async () => {
    getHealthReport.mockResolvedValue(
      report({ errors: [issue({ id: '1' }), issue({ id: '2' }), issue({ id: '3' }), issue({ id: '4' })] }),
    );
    const result = await healthSignals.load();
    expect(result.items).toHaveLength(3);
    expect(result.items[0]).toMatchObject({ icon: 'bug', href: '/health', id: 'sentry-1' });
  });

  it('raises the critical banner at ten errors an hour, not nine', async () => {
    getHealthReport.mockResolvedValue(report({ errorsLastHour: 9, errors: [issue()] }));
    expect((await healthSignals.load()).critical).toBeNull();

    // Two DIFFERENT readings inside one test, so the cached first one has to go
    // — otherwise the second assertion would be re-reading the nine-error report
    // and the boundary this test names would not be measured at all.
    invalidateHealthCache();
    getHealthReport.mockResolvedValue(report({ errorsLastHour: 10, errors: [issue()] }));
    expect((await healthSignals.load()).critical).toMatchObject({
      fingerprint: 'errors:PP-1',
      href: '/health',
    });
  });

  /**
   * Wave 4 made the error-spike threshold per-operator. Three things have to
   * hold, and each is asserted on its own:
   *
   *  1. The default is still exactly 10, because the console layout resolves it
   *     on every render and an operator with no preferences row must behave as
   *     the hardcoded constant did.
   *  2. A supplied threshold is actually used — not accepted and ignored.
   *  3. The threshold reaches the derivation and nothing else: the tray rows
   *     and the badge count are global and must not move with it.
   */
  it('defaults to the preference layer\'s own default threshold, not a second copy of 10', () => {
    expect(DEFAULT_ALERT_PREFS.errorSpikeThreshold).toBe(10);
  });

  it('raises the banner at a LOWER operator threshold that the default would not', async () => {
    getHealthReport.mockResolvedValue(report({ errorsLastHour: 4, errors: [issue()] }));

    // Same report, same cache entry, two thresholds — which is the point: the
    // probes are global, only the derivation is personal.
    expect((await createHealthSignals(10).load()).critical).toBeNull();
    expect((await createHealthSignals(4).load()).critical).toMatchObject({
      fingerprint: 'errors:PP-1',
      shortText: '4 errors/hr',
    });
  });

  it('withholds the banner at a HIGHER operator threshold the default would have fired', async () => {
    getHealthReport.mockResolvedValue(report({ errorsLastHour: 12, errors: [issue()] }));

    expect((await healthSignals.load()).critical).toMatchObject({ fingerprint: 'errors:PP-1' });
    expect((await createHealthSignals(50).load()).critical).toBeNull();
  });

  it('leaves the badge count and tray rows untouched by the threshold', async () => {
    getHealthReport.mockResolvedValue(
      report({ errorsLastHour: 12, errors: [issue()], jobs: [{ source: 'Cron', name: 'j', error: 'e', when: 'now', attempts: '1', retryable: true }] }),
    );

    const strict = await createHealthSignals(1).load();
    const lax = await createHealthSignals(1000).load();

    expect(strict.count).toBe(lax.count);
    expect(strict.items).toEqual(lax.items);
    // Only the banner differs.
    expect(strict.critical).not.toBeNull();
    expect(lax.critical).toBeNull();
  });

  it('lets a read failure reject so getShellSignals can report it', async () => {
    // Swallowing here would make a broken health read indistinguishable from a
    // healthy platform — `getShellSignals` settles providers and Sentries the
    // rejection, which is the behaviour worth keeping.
    getHealthReport.mockRejectedValue(new Error('cron_runs read failed'));
    await expect(healthSignals.load()).rejects.toThrow('cron_runs read failed');
  });
});

/**
 * The cache is the reason this provider is affordable to put in the shell.
 *
 * Uncached, `load()` ran six outbound probes and three privileged reads on every
 * console page navigation AND on every 60-second poll, for every open tab. These
 * cases assert the three properties that claim rests on — a second call inside
 * the TTL does not re-probe, concurrent callers share one load, and a failure is
 * not remembered — against the real `withHealthCache`, not a stub.
 */
describe('healthSignals caching', () => {
  it('does not re-probe within the TTL', async () => {
    await healthSignals.load();
    await healthSignals.load();
    await healthSignals.load();

    expect(getHealthReport).toHaveBeenCalledTimes(1);
  });

  it('collapses concurrent callers into ONE load', async () => {
    // The page and the shell signal provider rendering in the same request tick
    // is the exact access pattern that motivated the cache: without in-flight
    // deduplication both miss and both probe.
    await Promise.all([healthSignals.load(), healthSignals.load(), healthSignals.load()]);

    expect(getHealthReport).toHaveBeenCalledTimes(1);
  });

  it('re-probes after the TTL expires', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-08T12:00:00Z'));
      await healthSignals.load();

      vi.setSystemTime(new Date(Date.parse('2026-09-08T12:00:00Z') + HEALTH_CACHE_TTL_MS + 1));
      await healthSignals.load();

      expect(getHealthReport).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not cache a failure — a transient outage is not remembered', async () => {
    getHealthReport.mockRejectedValueOnce(new Error('cron_runs read failed'));
    await expect(healthSignals.load()).rejects.toThrow('cron_runs read failed');

    // The next caller gets a real attempt, not the remembered rejection.
    const result = await healthSignals.load();
    expect(result.count).toBe(0);
    expect(getHealthReport).toHaveBeenCalledTimes(2);
  });

  it('is NOT dropped by a billing invalidation', async () => {
    // Separate instances, and this is the semantic reason for them: a plan
    // change fires `invalidateBillingCache()` and says nothing whatsoever about
    // whether Resend is up. A shared generation counter would couple them.
    await healthSignals.load();
    invalidateBillingCache();
    await healthSignals.load();

    expect(getHealthReport).toHaveBeenCalledTimes(1);
  });
});
