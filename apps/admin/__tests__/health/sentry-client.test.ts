/**
 * The Sentry issues client.
 *
 * Two halves: `parseIssue`, which is pure and is tested against a captured
 * shape of the real API response, and `createSentryClient`, whose whole job is
 * to be ABSENT when the console is not wired to Sentry. That second half
 * matters more than it looks: `HealthReport.errors` is `SentryIssue[] | null`,
 * and a client that returned an empty array instead of `null` would render
 * "no production errors" on a console that has never asked Sentry anything.
 *
 * `fetch` is injected — nothing here reaches the network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createSentryClient, parseIssue } from '@/lib/server/sentry';

/** Captured from GET /api/0/projects/{org}/{project}/issues/. */
const sample = {
  id: '42',
  shortId: 'PROPERTY-PRO-7',
  title: 'TypeError: x',
  culprit: 'lib/compliance/score.ts',
  // A STRING in the real payload, which is why parseIssue coerces.
  count: '6',
  lastSeen: '2026-09-08T09:00:00Z',
  permalink: 'https://propertypro.sentry.io/issues/42/',
  stats: { '24h': [[1, 0], [2, 3]] },
};

const ORIGINAL = {
  token: process.env.SENTRY_API_TOKEN,
  org: process.env.SENTRY_ORG,
};

beforeEach(() => {
  delete process.env.SENTRY_API_TOKEN;
  delete process.env.SENTRY_ORG;
});

afterEach(() => {
  if (ORIGINAL.token === undefined) delete process.env.SENTRY_API_TOKEN;
  else process.env.SENTRY_API_TOKEN = ORIGINAL.token;
  if (ORIGINAL.org === undefined) delete process.env.SENTRY_ORG;
  else process.env.SENTRY_ORG = ORIGINAL.org;
});

describe('sentry client', () => {
  it('parses a raw issue', () => {
    expect(parseIssue(sample)).toMatchObject({
      id: '42',
      shortId: 'PROPERTY-PRO-7',
      title: 'TypeError: x',
      culprit: 'lib/compliance/score.ts',
      count: 6,
      hourly: [0, 3],
    });
  });

  it('parses an issue with no stats into an empty hourly series', () => {
    // MiniBars renders nothing for an empty series, which is the whole reason
    // this is allowed to be [] rather than a throw.
    expect(parseIssue({ ...sample, stats: undefined }).hourly).toEqual([]);
  });

  it('returns null without a token', () => {
    process.env.SENTRY_ORG = 'propertypro';
    expect(createSentryClient()).toBeNull();
  });

  it('returns null without an org', () => {
    process.env.SENTRY_API_TOKEN = 't';
    expect(createSentryClient()).toBeNull();
  });

  it('calls the regional issues endpoint with the bearer token', async () => {
    process.env.SENTRY_API_TOKEN = 't';
    process.env.SENTRY_ORG = 'propertypro';
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify([sample]))) as unknown as typeof fetch;

    const client = createSentryClient(fetchImpl);
    expect(client).not.toBeNull();
    const issues = await client!.listIssues('property-pro');

    const calls = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    expect(calls[0]![0]).toBe(
      'https://us.sentry.io/api/0/projects/propertypro/property-pro/issues/?query=is%3Aunresolved&statsPeriod=24h&sort=freq&limit=10',
    );
    expect((calls[0]![1]!.headers as Record<string, string>).authorization).toBe('Bearer t');
    expect(issues[0]!.count).toBe(6);
  });

  it('throws on a non-2xx response so the report can fall back to null', async () => {
    process.env.SENTRY_API_TOKEN = 't';
    process.env.SENTRY_ORG = 'propertypro';
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 403 })) as unknown as typeof fetch;
    await expect(createSentryClient(fetchImpl)!.listIssues('property-pro')).rejects.toThrow(/403/);
  });
});
