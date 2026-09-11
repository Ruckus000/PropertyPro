/**
 * The service probes and the report that composes them.
 *
 * Every dependency is injected — `fetch`, the clock, the Supabase ping, the
 * Stripe client, the two row loaders. Nothing in this file reaches a network or
 * a database, which is also the point of the `HealthDeps` seam: the probes are
 * the part of the health surface most likely to be wrong about an UNCONFIGURED
 * environment, and `unknown` vs `down` is a distinction nobody can test against
 * a live system.
 *
 * The rule the cases below pin: an env var that is not set reports `unknown`
 * ("we did not ask"), and a dependency that is set but unreachable reports
 * `down` ("we asked and it failed"). Collapsing those two makes a console on a
 * fresh checkout look like a production outage.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  getHealthReport,
  probeAdminApp,
  probeResend,
  probeStripeWebhooks,
  probeSupabase,
  probeWebApp,
  summariseStripeEvent,
  type CronRunRow,
  type HealthDeps,
  type StripeWebhookRow,
} from '@/lib/server/health';

const okJson = (body: unknown, status = 200) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const rejecting = () =>
  vi.fn(async () => {
    throw new Error('ECONNREFUSED');
  }) as unknown as typeof fetch;

const NOW = new Date('2026-09-08T12:00:00Z');

describe('probeWebApp', () => {
  it('reports both Web app and API ok when /api/health says ok', async () => {
    const { web, api } = await probeWebApp('https://www.getpropertypro.com', okJson({ status: 'ok' }));
    expect(web.state).toBe('ok');
    expect(api.state).toBe('ok');
  });

  it('hits /api/health on the configured origin', async () => {
    const fetchImpl = okJson({ status: 'ok' });
    await probeWebApp('https://www.getpropertypro.com/', fetchImpl);
    // Trailing slash stripped — `${origin}/api/health` would otherwise double it.
    expect((fetchImpl as unknown as { mock: { calls: [string][] } }).mock.calls[0]![0]).toBe(
      'https://www.getpropertypro.com/api/health',
    );
  });

  it('reports unknown — not down — when WEB_APP_ORIGIN is unset', async () => {
    const fetchImpl = okJson({ status: 'ok' });
    const { web, api } = await probeWebApp(undefined, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(web.state).toBe('unknown');
    expect(api.state).toBe('unknown');
    expect(web.meta).toMatch(/WEB_APP_ORIGIN/);
  });

  it('reports down when the origin is unreachable', async () => {
    const { web, api } = await probeWebApp('https://www.getpropertypro.com', rejecting());
    expect(web.state).toBe('down');
    expect(api.state).toBe('down');
    expect(web.short).toBe('Unreachable');
  });

  it('reports down on a non-2xx response', async () => {
    const { web } = await probeWebApp('https://www.getpropertypro.com', okJson({}, 503));
    expect(web.state).toBe('down');
  });

  it('separates a reachable web app from a degraded API', async () => {
    // The page renders but its own health endpoint says something is wrong:
    // the deployment is up, the API is not ok. Reporting both as `down` would
    // hide which half to look at.
    const { web, api } = await probeWebApp('https://x.test', okJson({ status: 'degraded' }));
    expect(web.state).toBe('ok');
    expect(api.state).toBe('degraded');
  });

  it('reports the API degraded when the body is not JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch;
    const { web, api } = await probeWebApp('https://x.test', fetchImpl);
    expect(web.state).toBe('ok');
    expect(api.state).toBe('degraded');
  });
});

describe('probeAdminApp', () => {
  it('reports ok against its own health route', async () => {
    expect((await probeAdminApp('https://admin.test', okJson({ status: 'ok' }))).state).toBe('ok');
  });

  it('reports unknown when the request host could not be resolved', async () => {
    const fetchImpl = okJson({ status: 'ok' });
    const status = await probeAdminApp(undefined, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(status.state).toBe('unknown');
  });

  it('reports down when unreachable', async () => {
    expect((await probeAdminApp('https://admin.test', rejecting())).state).toBe('down');
  });
});

describe('probeSupabase', () => {
  it('reports ok and a latency in the meta', async () => {
    const status = await probeSupabase(async () => ({ error: null }));
    expect(status.state).toBe('ok');
    expect(status.meta).toMatch(/^\d+ ms$/);
  });

  it('reports down on a PostgREST error object — which RESOLVES, not throws', async () => {
    const status = await probeSupabase(async () => ({ error: { message: 'permission denied' } }));
    expect(status.state).toBe('down');
    expect(status.short).toBe('Query failed');
  });

  it('reports down when the client throws', async () => {
    expect(
      (
        await probeSupabase(async () => {
          throw new Error('getaddrinfo ENOTFOUND');
        })
      ).state,
    ).toBe('down');
  });

  it('reports unknown when the service-role credentials are unset', async () => {
    const status = await probeSupabase(null);
    expect(status.state).toBe('unknown');
    expect(status.meta).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe('probeResend', () => {
  it('reports ok on a 200 from the domains endpoint', async () => {
    const fetchImpl = okJson({ data: [] });
    expect((await probeResend('re_x', fetchImpl)).state).toBe('ok');
    const calls = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    expect(calls[0]![0]).toBe('https://api.resend.com/domains');
    expect((calls[0]![1]!.headers as Record<string, string>).authorization).toBe('Bearer re_x');
  });

  it('reports unknown when RESEND_API_KEY is unset', async () => {
    const fetchImpl = okJson({});
    const status = await probeResend(undefined, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(status.state).toBe('unknown');
    expect(status.meta).toMatch(/RESEND_API_KEY/);
  });

  it('reports down on a 401 — a key that is set but wrong', async () => {
    expect((await probeResend('re_bad', okJson({}, 401))).state).toBe('down');
  });

  it('reports down when unreachable', async () => {
    expect((await probeResend('re_x', rejecting())).state).toBe('down');
  });
});

describe('probeStripeWebhooks', () => {
  const stripeOk = { balance: { retrieve: vi.fn(async () => ({ object: 'balance' })) } };

  it('reports ok with no backlog', async () => {
    const status = await probeStripeWebhooks(stripeOk, [], NOW);
    expect(status.state).toBe('ok');
  });

  it('reports degraded with at least one unprocessed event in the last hour', async () => {
    const status = await probeStripeWebhooks(
      stripeOk,
      [
        { event_id: 'evt_1', received_at: '2026-09-08T11:30:00Z' },
        { event_id: 'evt_2', received_at: '2026-09-08T11:45:00Z' },
        // Older than an hour — counted in the 24h total, not the hourly rate.
        { event_id: 'evt_3', received_at: '2026-09-08T02:00:00Z' },
      ],
      NOW,
    );
    expect(status.state).toBe('degraded');
    expect(status.short).toBe('2/hr');
    expect(status.meta).toMatch(/3 unprocessed/);
  });

  it('reports down when the Stripe API call fails', async () => {
    const status = await probeStripeWebhooks(
      { balance: { retrieve: async () => { throw new Error('Invalid API Key'); } } },
      [],
      NOW,
    );
    expect(status.state).toBe('down');
  });

  it('reports unknown when STRIPE_SECRET_KEY is unset', async () => {
    const status = await probeStripeWebhooks(null, [], NOW);
    expect(status.state).toBe('unknown');
    expect(status.meta).toMatch(/STRIPE_SECRET_KEY/);
  });
});

describe('summariseStripeEvent', () => {
  it('is never retryable — replay is a Stripe dashboard action', () => {
    const job = summariseStripeEvent({ event_id: 'evt_1', received_at: '2026-09-08T11:00:00Z' }, NOW);
    expect(job).toMatchObject({
      source: 'Stripe',
      name: 'evt_1',
      error: 'not processed',
      retryable: false,
    });
    expect(job.slug).toBeUndefined();
  });
});

describe('getHealthReport', () => {
  const cronRows: CronRunRow[] = [
    { job_slug: 'expire-demos', last_status: 'error', last_error: 'timeout', last_started_at: '2026-09-08T11:00:00Z', consecutive_failures: 3 },
    { job_slug: 'revenue-snapshot', last_status: 'ok', last_error: null, last_started_at: '2026-09-08T11:00:00Z', consecutive_failures: 0 },
  ];
  const stripeRows: StripeWebhookRow[] = [{ event_id: 'evt_9', received_at: '2026-09-08T11:50:00Z' }];

  const deps = (over: Partial<HealthDeps> = {}): Partial<HealthDeps> => ({
    fetchImpl: okJson({ status: 'ok' }),
    now: () => NOW,
    webOrigin: 'https://web.test',
    adminOrigin: 'https://admin.test',
    resendApiKey: 're_x',
    stripe: { balance: { retrieve: async () => ({}) } },
    pingSupabase: async () => ({ error: null }),
    loadCronRuns: async () => cronRows,
    loadUnprocessedStripeEvents: async () => stripeRows,
    sentry: null,
    sentryProject: 'property-pro',
    ...over,
  });

  it('names all six services in a stable order', async () => {
    const report = await getHealthReport(deps());
    expect(report.services.map((s) => s.name)).toEqual([
      'API',
      'Web app',
      'Admin',
      'Supabase',
      'Stripe webhooks',
      'Resend',
    ]);
  });

  it('reports only the failing cron jobs, plus unprocessed stripe events', async () => {
    const report = await getHealthReport(deps());
    expect(report.jobs).toHaveLength(2);
    expect(report.jobs[0]).toMatchObject({ source: 'Cron', name: 'expire-demos', retryable: true });
    expect(report.jobs[1]).toMatchObject({ source: 'Stripe', name: 'evt_9', retryable: false });
  });

  it('leaves errors null when Sentry is not configured', async () => {
    // null, NOT [] — an empty list renders as "no production errors", which is
    // a claim the console is in no position to make.
    const report = await getHealthReport(deps({ sentry: null }));
    expect(report.errors).toBeNull();
    expect(report.errorsLastHour).toBe(0);
  });

  it('leaves errors null when Sentry is configured but the call fails', async () => {
    const report = await getHealthReport(
      deps({ sentry: { listIssues: async () => { throw new Error('403'); } } }),
    );
    expect(report.errors).toBeNull();
  });

  it('sums the most recent hourly bucket across issues for errorsLastHour', async () => {
    const issue = (shortId: string, hourly: number[]) => ({
      id: shortId, shortId, title: 't', culprit: 'c', count: 1, lastSeen: 'l', permalink: 'p', hourly,
    });
    const report = await getHealthReport(
      deps({
        sentry: { listIssues: async () => [issue('A', [1, 2, 4]), issue('B', [0, 0, 3])] },
      }),
    );
    expect(report.errorsLastHour).toBe(7);
    expect(report.errors).toHaveLength(2);
  });

  it('survives every dependency failing at once rather than throwing', async () => {
    // The health page is where an operator goes BECAUSE something is broken. A
    // report that throws when its own probes fail is a 500 on the one screen
    // that must render.
    const boom = async () => {
      throw new Error('down');
    };
    const report = await getHealthReport(
      deps({
        fetchImpl: rejecting(),
        pingSupabase: boom,
        loadCronRuns: boom,
        loadUnprocessedStripeEvents: boom,
        stripe: { balance: { retrieve: boom } },
      }),
    );
    expect(report.services.every((s) => s.state === 'down')).toBe(true);
    expect(report.jobs).toEqual([]);
    expect(report.checkedAt).toBe(NOW.toISOString());
  });
});
