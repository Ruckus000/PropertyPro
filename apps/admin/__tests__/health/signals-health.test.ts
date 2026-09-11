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

import { healthSignals } from '@/lib/server/signals/health';

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

    getHealthReport.mockResolvedValue(report({ errorsLastHour: 10, errors: [issue()] }));
    expect((await healthSignals.load()).critical).toMatchObject({
      fingerprint: 'errors:PP-1',
      href: '/health',
    });
  });

  it('lets a read failure reject so getShellSignals can report it', async () => {
    // Swallowing here would make a broken health read indistinguishable from a
    // healthy platform — `getShellSignals` settles providers and Sentries the
    // rejection, which is the behaviour worth keeping.
    getHealthReport.mockRejectedValue(new Error('cron_runs read failed'));
    await expect(healthSignals.load()).rejects.toThrow('cron_runs read failed');
  });
});
