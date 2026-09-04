import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { processDueSitePublishesMock } = vi.hoisted(() => ({
  processDueSitePublishesMock: vi.fn(),
}));

vi.mock('@/lib/services/site-publish-schedule-service', () => ({
  processDueSitePublishes: processDueSitePublishesMock,
}));

import { GET, POST } from '../../src/app/api/v1/internal/scheduled-site-publish/route';

const URL = 'http://localhost:3000/api/v1/internal/scheduled-site-publish';

describe('scheduled-site-publish cron route', () => {
  const previousRouteSecret = process.env.SCHEDULED_SITE_PUBLISH_CRON_SECRET;
  const previousCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SCHEDULED_SITE_PUBLISH_CRON_SECRET = 'test-secret';
    processDueSitePublishesMock.mockResolvedValue({
      claimed: 2,
      published: 1,
      nothingToPublish: 1,
      failed: 0,
    });
  });

  afterEach(() => {
    // Restored rather than deleted: these are real process-wide env vars, and
    // leaving a test value behind changes how later files' auth behaves.
    if (previousRouteSecret === undefined) delete process.env.SCHEDULED_SITE_PUBLISH_CRON_SECRET;
    else process.env.SCHEDULED_SITE_PUBLISH_CRON_SECRET = previousRouteSecret;
    if (previousCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousCronSecret;
  });

  it('401s without a bearer token, and does not run the job', async () => {
    const res = await GET(new NextRequest(URL));

    expect(res.status).toBe(401);
    expect(processDueSitePublishesMock).not.toHaveBeenCalled();
  });

  it('401s on the wrong token', async () => {
    const res = await GET(
      new NextRequest(URL, { headers: { authorization: 'Bearer nope' } }),
    );

    expect(res.status).toBe(401);
    expect(processDueSitePublishesMock).not.toHaveBeenCalled();
  });

  it('runs the job and returns its summary', async () => {
    const res = await GET(
      new NextRequest(URL, { headers: { authorization: 'Bearer test-secret' } }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      data: { claimed: 2, published: 1, nothingToPublish: 1, failed: 0 },
    });
  });

  it('accepts POST as well as GET', async () => {
    /*
     * Vercel Cron issues GET; the GitHub-Actions era of these jobs issued POST.
     * Serving both means the scheduler's verb can never be the thing that
     * silently stops scheduled publishes from firing.
     */
    const res = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { authorization: 'Bearer test-secret' },
      }),
    );

    expect(res.status).toBe(200);
    expect(processDueSitePublishesMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to the platform-wide CRON_SECRET when no per-route secret is set', async () => {
    delete process.env.SCHEDULED_SITE_PUBLISH_CRON_SECRET;
    process.env.CRON_SECRET = 'platform-secret';

    const res = await GET(
      new NextRequest(URL, { headers: { authorization: 'Bearer platform-secret' } }),
    );

    expect(res.status).toBe(200);
  });
});
