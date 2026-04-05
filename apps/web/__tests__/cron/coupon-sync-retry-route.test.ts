import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { recalculateVolumeTierMock, createUnscopedClientMock } = vi.hoisted(() => ({
  recalculateVolumeTierMock: vi.fn(),
  createUnscopedClientMock: vi.fn(() => ({
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [],
        }),
      }),
    }),
  })),
}));

vi.mock('@propertypro/db', () => ({
  billingGroups: {},
}));

vi.mock('@propertypro/db/filters', () => ({
  and: vi.fn(),
  lt: vi.fn(),
  inArray: vi.fn(),
  isNull: vi.fn(),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@/lib/billing/billing-group-service', () => ({
  recalculateVolumeTier: recalculateVolumeTierMock,
}));

import { POST } from '../../src/app/api/v1/internal/coupon-sync-retry/route';

const URL = 'http://localhost:3000/api/v1/internal/coupon-sync-retry';

describe('coupon-sync-retry cron route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.CRON_SECRET;
    delete process.env.COUPON_SYNC_RETRY_CRON_SECRET;
  });

  it('accepts the canonical coupon retry secret', async () => {
    process.env.COUPON_SYNC_RETRY_CRON_SECRET = 'coupon-secret';

    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { authorization: 'Bearer coupon-secret' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 0, results: [] });
  });

  it('falls back to CRON_SECRET when the coupon-specific secret is absent', async () => {
    process.env.CRON_SECRET = 'fallback-secret';

    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { authorization: 'Bearer fallback-secret' },
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ processed: 0, results: [] });
  });

  it('rejects the fallback token when the coupon-specific secret is set', async () => {
    process.env.COUPON_SYNC_RETRY_CRON_SECRET = 'coupon-secret';
    process.env.CRON_SECRET = 'fallback-secret';

    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { authorization: 'Bearer fallback-secret' },
    });

    const res = await POST(req);

    expect(res.status).toBe(401);
  });
});
