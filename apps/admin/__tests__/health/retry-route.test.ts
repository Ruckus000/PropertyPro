/**
 * POST /api/admin/health/jobs/[slug]/retry — a trust boundary, not a convenience.
 *
 * The route takes a slug out of the URL and interpolates it into a `fetch` aimed
 * at `${WEB_APP_ORIGIN}/api/v1/internal/<slug>`, authenticated with the
 * platform-wide `CRON_SECRET`. Every one of those twenty endpoints runs
 * privileged, side-effectful work — `expire-demos` soft-deletes communities,
 * `late-fee-processor` assesses money. So the slug is validated twice, and the
 * assertions below are about the FETCH, not the status code: a handler that
 * 404s after issuing the request has already done the harm.
 *
 * Every case asserts `fetch` was not called BEFORE asserting the status, so a
 * regression's failure message names the actual harm rather than a number.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '@propertypro/shared/http';

const admin = { id: 'u', email: 'e', role: 'super_admin' };
// Overridable so the gate can be made to REFUSE — a permanently-succeeding
// mock never exercises the route's first line.
let requirePlatformAdminImpl: () => Promise<typeof admin> = async () => admin;
vi.mock('@/lib/auth/platform-admin', () => ({
  requirePlatformAdmin: () => requirePlatformAdminImpl(),
}));

const logAdminAction = vi.fn(async (_p: unknown) => {});
vi.mock('@/lib/audit/log-admin-action', () => ({
  logAdminAction: (p: unknown) => logAdminAction(p),
}));

const listKnownJobSlugs = vi.fn(async () => [
  'expire-demos',
  'revenue-snapshot',
  'notification-digests-process',
]);
vi.mock('@/lib/server/health', () => ({
  listKnownJobSlugs: () => listKnownJobSlugs(),
}));

import { POST } from '@/app/api/admin/health/jobs/[slug]/retry/route';

const post = (slug: string) =>
  POST(new NextRequest('http://a/x', { method: 'POST' }), { params: Promise.resolve({ slug }) });

const ORIGINAL = {
  secret: process.env.CRON_SECRET,
  origin: process.env.WEB_APP_ORIGIN,
  fetch: global.fetch,
};

beforeEach(() => {
  requirePlatformAdminImpl = async () => admin;
  process.env.CRON_SECRET = 's';
  process.env.WEB_APP_ORIGIN = 'https://www.getpropertypro.com';
  global.fetch = vi.fn(async () => new Response('{}', { status: 200 })) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = ORIGINAL.fetch;
  if (ORIGINAL.secret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = ORIGINAL.secret;
  if (ORIGINAL.origin === undefined) delete process.env.WEB_APP_ORIGIN;
  else process.env.WEB_APP_ORIGIN = ORIGINAL.origin;
});

const fetchMock = () => global.fetch as unknown as { mock: { calls: [string, RequestInit][] } };

describe('POST /api/admin/health/jobs/[slug]/retry', () => {
  it('calls the web cron with the secret and audits', async () => {
    const res = await post('expire-demos');

    expect(res.status).toBe(200);
    expect(fetchMock().mock.calls[0]![0]).toBe(
      'https://www.getpropertypro.com/api/v1/internal/expire-demos',
    );
    const init = fetchMock().mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    // `requireCronSecret` in apps/web reads `authorization: Bearer <token>` and
    // compares against CRON_SECRET. Per-route secret names are what made every
    // cron 401 silently for months — do not reintroduce one here.
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer s');
    expect(await res.json()).toEqual({ data: { status: 200, ok: true } });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'cron_job_retried',
        resourceType: 'cron_job',
        resourceId: 'expire-demos',
        metadata: { status: 200 },
      }),
    );
  });

  it('sends the NESTED job to its real path, not to the slug', async () => {
    // `notification-digests-process` lives at
    // `/api/v1/internal/notification-digests/process`. The slug's `/` → `-`
    // substitution is not reversible, so interpolating the slug POSTed to a path
    // that does not exist — and the board reported the resulting 404 as "the job
    // ran and failed", on the one screen whose purpose is saying what is broken.
    // It is reachable: `registerCronJobs(CRON_JOB_SLUGS)` inserts a `cron_runs`
    // row for every registry slug, so the Retry button renders for this one.
    const res = await post('notification-digests-process');

    expect(res.status).toBe(200);
    expect(fetchMock().mock.calls[0]![0]).toBe(
      'https://www.getpropertypro.com/api/v1/internal/notification-digests/process',
    );
  });

  it('404s a traversal slug without calling anything', async () => {
    const res = await post('../etc');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(listKnownJobSlugs).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
  });

  it.each([
    ['path traversal', '../../internal/provision'],
    ['an absolute url', 'https://evil.test/x'],
    ['a protocol-relative host', '//evil.test/x'],
    ['an uppercase slug', 'Expire-Demos'],
    ['an underscore', 'expire_demos'],
    ['a query string', 'expire-demos?force=1'],
    ['an encoded separator', 'expire-demos%2F..'],
    ['an empty slug', ''],
  ])('404s %s without calling fetch', async (_label, slug) => {
    const res = await post(slug);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.status).toBe(404);
  });

  it('404s a well-formed but unknown slug without calling fetch', async () => {
    // The shape check alone is not enough: `provision` matches /^[a-z0-9-]+$/
    // and is a real privileged endpoint, but it is not a cron job this console
    // has ever observed, so it is not retryable from here.
    const res = await post('provision');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(listKnownJobSlugs).toHaveBeenCalled();
    expect(res.status).toBe(404);
  });

  it('refuses before fetching when the gate rejects', async () => {
    requirePlatformAdminImpl = async () => {
      throw new UnauthorizedError();
    };
    const res = await post('expire-demos');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(listKnownJobSlugs).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  it('refuses rather than fetching a relative url when WEB_APP_ORIGIN is unset', async () => {
    delete process.env.WEB_APP_ORIGIN;
    const res = await post('expire-demos');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('refuses a WEB_APP_ORIGIN that is not an http(s) origin', async () => {
    process.env.WEB_APP_ORIGIN = 'file:///etc';
    const res = await post('expire-demos');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
  });

  it('refuses rather than sending an undefined bearer token', async () => {
    delete process.env.CRON_SECRET;
    const res = await post('expire-demos');
    expect(global.fetch).not.toHaveBeenCalled();
    expect(res.status).toBe(503);
    expect(logAdminAction).not.toHaveBeenCalled();
  });

  it('reports a non-2xx cron response without pretending it worked', async () => {
    global.fetch = vi.fn(async () => new Response('nope', { status: 500 })) as unknown as typeof fetch;
    const res = await post('expire-demos');
    // The RETRY succeeded as an operation — the job failed. 200 with ok:false
    // is the honest shape; a 500 here would read as "the console is broken".
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { status: 500, ok: false } });
    expect(logAdminAction).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'cron_job_retried', metadata: { status: 500 } }),
    );
  });

  it('502s when the web app is unreachable, and audits nothing', async () => {
    global.fetch = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const res = await post('expire-demos');
    expect(res.status).toBe(502);
    expect(logAdminAction).not.toHaveBeenCalled();
  });
});
