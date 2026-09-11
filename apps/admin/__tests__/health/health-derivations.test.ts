/**
 * The pure half of the health report: what counts as a failed cron run, and
 * what is worth interrupting the operator with a banner.
 *
 * Nothing here touches Supabase, Stripe, Resend or Sentry — the probes that do
 * are covered in `health-probes.test.ts` with injected fetch/clients.
 */
import { describe, expect, it } from 'vitest';

import {
  CRON_CONSECUTIVE_FAILURE_THRESHOLD,
  deriveCritical,
  summariseCronRun,
  type CronRunRow,
  type HealthReport,
} from '@/lib/server/health';

const report = (over: Partial<HealthReport>): HealthReport => ({
  services: [],
  errors: [],
  jobs: [],
  errorsLastHour: 0,
  checkedAt: 'x',
  ...over,
});

const cronRow = (over: Partial<CronRunRow>): CronRunRow => ({
  job_slug: 'x',
  last_status: 'ok',
  last_error: null,
  last_started_at: '2026-09-08T00:00:00Z',
  consecutive_failures: 0,
  ...over,
});

describe('health derivations', () => {
  it('fires the banner on an error spike with a stable fingerprint', () => {
    const c = deriveCritical(
      report({
        errorsLastHour: 14,
        errors: [
          {
            id: '1',
            shortId: 'PP-1',
            title: 'StripeSignatureVerificationError',
            culprit: 'api/webhooks/stripe',
            count: 14,
            lastSeen: '2026-09-08T06:40:00Z',
            permalink: 'p',
            hourly: [],
          },
        ],
      }),
      { errorsPerHour: 10 },
    );
    expect(c?.fingerprint).toBe('errors:PP-1');
    expect(c?.href).toBe('/health');
  });

  it('fires on a stripe webhook backlog and on repeated cron failures', () => {
    expect(
      deriveCritical(
        report({ services: [{ name: 'Stripe webhooks', state: 'degraded', short: '3/hr', meta: '' }] }),
        { errorsPerHour: 10 },
      )?.fingerprint,
    ).toMatch(/^stripe-webhooks:/);

    expect(
      deriveCritical(
        report({
          jobs: [
            {
              source: 'Cron',
              name: 'expire-demos',
              error: 'timeout',
              when: 'x',
              attempts: '2 attempts',
              retryable: true,
              slug: 'expire-demos',
              consecutiveFailures: 2,
            },
          ],
        }),
        { errorsPerHour: 10 },
      )?.fingerprint,
    ).toBe('cron:expire-demos');
  });

  it('stays quiet below thresholds', () => {
    expect(deriveCritical(report({ errorsLastHour: 9 }), { errorsPerHour: 10 })).toBeNull();
  });

  it('does not fire on a single cron failure', () => {
    // One failed tick is a `Retry` button, not a banner. The threshold is what
    // separates "a job blipped" from "a job is broken".
    expect(CRON_CONSECUTIVE_FAILURE_THRESHOLD).toBe(2);
    expect(
      deriveCritical(
        report({
          jobs: [
            {
              source: 'Cron',
              name: 'expire-demos',
              error: 'timeout',
              when: 'x',
              attempts: '1 attempt',
              retryable: true,
              slug: 'expire-demos',
              consecutiveFailures: 1,
            },
          ],
        }),
        { errorsPerHour: 10 },
      ),
    ).toBeNull();
  });

  it('ranks an error spike above a webhook backlog', () => {
    const c = deriveCritical(
      report({
        errorsLastHour: 20,
        errors: [
          {
            id: '1',
            shortId: 'PP-9',
            title: 'boom',
            culprit: 'c',
            count: 20,
            lastSeen: 'l',
            permalink: 'p',
            hourly: [],
          },
        ],
        services: [{ name: 'Stripe webhooks', state: 'down', short: 'x', meta: '' }],
      }),
      { errorsPerHour: 10 },
    );
    expect(c?.fingerprint).toBe('errors:PP-9');
  });

  it('fires an error spike even when Sentry named no issue', () => {
    // `errorsLastHour` can be over threshold with an empty issue list only if
    // the counts and the list disagree, but the banner must still have a
    // fingerprint rather than reading `errors:undefined`.
    const c = deriveCritical(report({ errorsLastHour: 11, errors: [] }), { errorsPerHour: 10 });
    expect(c?.fingerprint).toBe('errors:spike');
  });

  it('summariseCronRun ignores healthy jobs', () => {
    expect(summariseCronRun(cronRow({}), new Date())).toBeNull();
    expect(
      summariseCronRun(
        cronRow({ job_slug: 'x', last_status: 'failed', last_error: 'timeout after 30 s', last_started_at: '2026-09-06T00:00:00Z', consecutive_failures: 2 }),
        new Date('2026-09-08T00:00:00Z'),
      ),
    ).toMatchObject({
      source: 'Cron',
      name: 'x',
      error: 'timeout after 30 s',
      attempts: '2 attempts',
      retryable: true,
    });
  });

  it("treats the status `withCronJob` actually writes — 'error' — as a failure", () => {
    // `cron-run-service.ts` writes 'ok' | 'error'. It never writes 'failed',
    // so a predicate matching only the plan's literal would be dead against
    // real data and would rely entirely on the consecutive_failures arm.
    expect(
      summariseCronRun(
        cronRow({ last_status: 'error', last_error: 'boom', consecutive_failures: 0 }),
        new Date('2026-09-08T00:00:00Z'),
      ),
    ).toMatchObject({ source: 'Cron', error: 'boom', attempts: '1 attempt' });
  });

  it('reports a never-run job honestly rather than as an age', () => {
    expect(
      summariseCronRun(
        cronRow({ last_status: null, last_started_at: null, consecutive_failures: 3, last_error: null }),
        new Date('2026-09-08T00:00:00Z'),
      ),
    ).toMatchObject({ when: 'never run', error: 'No error recorded', attempts: '3 attempts' });
  });

  it('carries the slug so the retry button has something to POST', () => {
    const job = summariseCronRun(
      cronRow({ job_slug: 'expire-demos', last_status: 'error', consecutive_failures: 1 }),
      new Date('2026-09-08T00:00:00Z'),
    );
    expect(job?.slug).toBe('expire-demos');
  });
});
