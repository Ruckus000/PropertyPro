import { describe, it, expect, vi, beforeEach } from 'vitest';

const { getBrandingMock, updateBrandingMock, executeMock, planFeaturesMock, resolvePlanIdMock, dbMock, selectMock, fromMock, whereMock, limitMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  const executeMock = vi.fn().mockResolvedValue(undefined);
  return {
    getBrandingMock: vi.fn(),
    updateBrandingMock: vi.fn(),
    executeMock,
    planFeaturesMock: {
      essentials: { siteAssetsQuotaBytes: 100 * 1024 * 1024 },
      professional: { siteAssetsQuotaBytes: 500 * 1024 * 1024 },
    },
    resolvePlanIdMock: vi.fn(),
    dbMock: { select: selectMock, execute: executeMock },
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
  // Identity-ish stub for the sql tagged template used by the atomic
  // quota-delta UPDATE in incrementAssetsUsage/decrementAssetsUsage.
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ __sql: { strings: [...strings], values } }),
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
  beforeEach(() => {
    vi.resetAllMocks();
    executeMock.mockResolvedValue(undefined);
  });

  // Increment/decrement now route through a single atomic SQL UPDATE
  // (jsonb_set + GREATEST(0, ...)). The previous JS-side read-modify-write
  // (getBranding → updateBranding) leaked increments under concurrent
  // finalize calls. Tests now assert on the dbMock.execute() call rather
  // than on the (no-longer-used) updateBrandingForCommunity helper.

  it('incrementAssetsUsage issues an atomic UPDATE with positive delta', async () => {
    await incrementAssetsUsage(42, 500);
    expect(executeMock).toHaveBeenCalledTimes(1);
    const sqlCall = executeMock.mock.calls[0][0];
    expect(sqlCall).toMatchObject({
      __sql: {
        // sql template strings should include the jsonb_set UPDATE + the
        // GREATEST(0, ...) clamp. Values include the bytes delta + community id.
        values: expect.arrayContaining([500, 42]),
      },
    });
  });

  it('decrementAssetsUsage passes a negative delta into the same UPDATE', async () => {
    await decrementAssetsUsage(42, 500);
    expect(executeMock).toHaveBeenCalledTimes(1);
    const sqlCall = executeMock.mock.calls[0][0];
    // -500 is the delta; GREATEST(0, ...) clamps in SQL (not exercised by the mock).
    expect(sqlCall.__sql.values).toEqual(expect.arrayContaining([-500, 42]));
  });

  it('uses GREATEST(0, ...) so decrements cannot drive the counter negative', async () => {
    await decrementAssetsUsage(42, 1_000_000);
    const sqlCall = executeMock.mock.calls[0][0];
    const sqlText = sqlCall.__sql.strings.join('');
    expect(sqlText).toContain('GREATEST');
    expect(sqlText).toContain('jsonb_set');
  });
});
