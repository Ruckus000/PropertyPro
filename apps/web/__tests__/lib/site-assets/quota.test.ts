import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getBrandingMock, updateBrandingMock, planFeaturesMock, resolvePlanIdMock, dbMock, selectMock, fromMock, whereMock, limitMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  return {
    getBrandingMock: vi.fn(),
    updateBrandingMock: vi.fn(),
    planFeaturesMock: {
      essentials: { siteAssetsQuotaBytes: 100 * 1024 * 1024 },
      professional: { siteAssetsQuotaBytes: 500 * 1024 * 1024 },
    },
    resolvePlanIdMock: vi.fn(),
    dbMock: { select: selectMock },
    selectMock,
    fromMock,
    whereMock,
    limitMock,
  };
});

vi.mock('@/lib/api/branding', () => ({
  getBrandingForCommunity: getBrandingMock,
  updateBrandingForCommunity: updateBrandingMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: () => dbMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
}));

// NOTE: vi.importActual cannot be used here because the real @propertypro/db
// requires DATABASE_URL at module load (packages/db/src/drizzle.ts throws if
// missing). This is the established pattern across the test suite — see
// site-blocks-service.test.ts, branding-route.test.ts, audit-middleware.test.ts.
vi.mock('@propertypro/db', () => ({
  communities: { id: 'communities.id', subscriptionPlan: 'communities.subscriptionPlan' },
}));

vi.mock('@/lib/telemetry/plan-resolution', () => ({
  resolvePlanIdWithTelemetry: resolvePlanIdMock,
}));

vi.mock('@propertypro/shared', () => ({
  PLAN_FEATURES: planFeaturesMock,
}));

import {
  getCommunitySiteAssetsUsage,
  assertWithinQuota,
  incrementAssetsUsage,
  decrementAssetsUsage,
  QuotaExceededError,
} from '@/lib/site-assets/quota';

describe('getCommunitySiteAssetsUsage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the stored counter', async () => {
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 12345 });
    expect(await getCommunitySiteAssetsUsage(42)).toBe(12345);
  });

  it('returns 0 when no branding row exists', async () => {
    getBrandingMock.mockResolvedValueOnce(null);
    expect(await getCommunitySiteAssetsUsage(42)).toBe(0);
  });

  it('returns 0 when assetsBytesUsed is unset', async () => {
    getBrandingMock.mockResolvedValueOnce({ primaryColor: '#fff' });
    expect(await getCommunitySiteAssetsUsage(42)).toBe(0);
  });
});

describe('assertWithinQuota', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    limitMock.mockResolvedValue([{ subscriptionPlan: 'essentials' }]);
    resolvePlanIdMock.mockReturnValue('essentials');
  });

  it('passes when current + add is under quota', async () => {
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 50 * 1024 * 1024 });
    await expect(assertWithinQuota(42, 10 * 1024 * 1024)).resolves.toBeUndefined();
  });

  it('passes at exact quota boundary', async () => {
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 90 * 1024 * 1024 });
    await expect(assertWithinQuota(42, 10 * 1024 * 1024)).resolves.toBeUndefined();
  });

  it('throws QuotaExceededError when over budget', async () => {
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 95 * 1024 * 1024 });
    await expect(assertWithinQuota(42, 10 * 1024 * 1024)).rejects.toBeInstanceOf(QuotaExceededError);
  });

  it('QuotaExceededError carries 413 + SITE_ASSETS_QUOTA_EXCEEDED', async () => {
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 95 * 1024 * 1024 });
    try {
      await assertWithinQuota(42, 10 * 1024 * 1024);
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(QuotaExceededError);
      expect((err as QuotaExceededError).code).toBe('SITE_ASSETS_QUOTA_EXCEEDED');
      expect((err as QuotaExceededError).statusCode).toBe(413);
    }
  });

  it('fails open (no throw) when community has null subscriptionPlan', async () => {
    limitMock.mockResolvedValueOnce([{ subscriptionPlan: null }]);
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 9999 * 1024 * 1024 });
    await expect(assertWithinQuota(42, 1)).resolves.toBeUndefined();
  });

  it('fails open when resolvePlanId returns null (unknown plan)', async () => {
    resolvePlanIdMock.mockReturnValueOnce(null);
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 9999 * 1024 * 1024 });
    await expect(assertWithinQuota(42, 1)).resolves.toBeUndefined();
  });
});

describe('increment / decrement', () => {
  // vi.resetAllMocks() (not clearAllMocks) is required here: the assertWithinQuota
  // fail-open tests queue getBrandingMock.mockResolvedValueOnce but never consume it
  // (getSiteAssetsQuotaBytes returns null early). resetAllMocks drains those queues.
  beforeEach(() => vi.resetAllMocks());

  it('incrementAssetsUsage adds to existing counter', async () => {
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 1000 });
    await incrementAssetsUsage(42, 500);
    expect(updateBrandingMock).toHaveBeenCalledWith(42, expect.objectContaining({ assetsBytesUsed: 1500 }));
  });

  it('incrementAssetsUsage starts from 0 when no counter set', async () => {
    getBrandingMock.mockResolvedValueOnce({});
    await incrementAssetsUsage(42, 500);
    expect(updateBrandingMock).toHaveBeenCalledWith(42, expect.objectContaining({ assetsBytesUsed: 500 }));
  });

  it('decrementAssetsUsage clamps at zero (never negative)', async () => {
    getBrandingMock.mockResolvedValueOnce({ assetsBytesUsed: 100 });
    await decrementAssetsUsage(42, 500);
    expect(updateBrandingMock).toHaveBeenCalledWith(42, expect.objectContaining({ assetsBytesUsed: 0 }));
  });
});
