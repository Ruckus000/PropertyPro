/**
 * Direct unit tests for the plan-feature guard.
 *
 * Written BEFORE the lifecycle-state refactor as a regression pin. Every other
 * test that touches `plan-guard` mocks it (see the route suites under
 * __tests__/vendors, __tests__/amenities, __tests__/work-orders), so nothing
 * asserted its real behavior — in particular the two documented fail-OPEN
 * degradation rules, which are load-bearing for the 65 prod communities that
 * have never been provisioned.
 *
 * These assertions must hold identically after the refactor.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const { createUnscopedClientMock, limitMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  return {
    limitMock,
    createUnscopedClientMock: vi.fn(() => ({
      select: () => ({ from: () => ({ where: () => ({ limit: limitMock }) }) }),
    })),
  };
});

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));
vi.mock('@propertypro/db', () => ({
  communities: {
    id: 'communities.id',
    subscriptionPlan: 'communities.subscription_plan',
    communityType: 'communities.community_type',
  },
}));
vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ _eq: [col, val] }),
}));

import { requirePlanFeature, getEffectiveFeaturesAndPlanForPage } from '@/lib/middleware/plan-guard';
import { AppError } from '@/lib/api/errors/AppError';

/** Shape the guard's single row query returns. */
function row(subscriptionPlan: string | null, communityType = 'condo_718') {
  limitMock.mockResolvedValue([{ subscriptionPlan, communityType }]);
}

describe('requirePlanFeature — degradation rules', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails OPEN on a null plan (community not yet provisioned)', async () => {
    row(null);
    await expect(requirePlanFeature(1, 'hasEsign')).resolves.toBeUndefined();
  });

  it('fails OPEN on an unrecognized plan string (legacy data)', async () => {
    row('some_plan_we_retired_in_2025');
    await expect(requirePlanFeature(1, 'hasEsign')).resolves.toBeUndefined();
  });

  it('fails OPEN when the community row does not exist', async () => {
    limitMock.mockResolvedValue([]);
    await expect(requirePlanFeature(1, 'hasEsign')).resolves.toBeUndefined();
  });

  it('resolves a legacy plan alias and gates on the resolved plan', async () => {
    // compliance_basic → essentials, which does NOT include e-sign.
    row('compliance_basic');
    await expect(requirePlanFeature(1, 'hasEsign')).rejects.toThrow(AppError);
  });
});

describe('requirePlanFeature — real plans', () => {
  beforeEach(() => vi.clearAllMocks());

  it('allows a feature the plan includes', async () => {
    row('professional');
    await expect(requirePlanFeature(1, 'hasEsign')).resolves.toBeUndefined();
  });

  it('throws 403 PLAN_UPGRADE_REQUIRED for a feature the plan lacks', async () => {
    row('essentials');
    await expect(requirePlanFeature(1, 'hasEsign')).rejects.toMatchObject({
      statusCode: 403,
      code: 'PLAN_UPGRADE_REQUIRED',
    });
  });

  it('names an upgrade plan the community type can actually buy', async () => {
    // Apartment's only ladder is Operations Plus; naming Professional here
    // would sell a plan the checkout route rejects.
    row('operations_plus', 'apartment');
    await expect(requirePlanFeature(1, 'hasStatutoryCategories')).rejects.toMatchObject({
      code: 'PLAN_UPGRADE_REQUIRED',
    });

    row('essentials', 'condo_718');
    await expect(requirePlanFeature(1, 'hasEsign')).rejects.toMatchObject({
      details: expect.objectContaining({ requiredPlanDisplayName: 'Professional' }),
    });
  });
});

describe('getEffectiveFeaturesAndPlanForPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails OPEN to the community-type features on a null plan', async () => {
    row(null);
    const { features, planId } = await getEffectiveFeaturesAndPlanForPage(1, 'condo_718');
    expect(planId).toBeNull();
    // Type features only — plan intersection is skipped entirely.
    expect(features.hasEsign).toBe(true);
    expect(features.hasStatutoryCategories).toBe(true);
  });

  it('intersects type AND plan for a real plan', async () => {
    row('essentials');
    const { features, planId } = await getEffectiveFeaturesAndPlanForPage(1, 'condo_718');
    expect(planId).toBe('essentials');
    expect(features.hasStatutoryCategories).toBe(true); // type ✓ plan ✓
    expect(features.hasEsign).toBe(false); // type ✓ plan ✗
  });

  it('withholds a feature the community TYPE lacks even when the plan has it', async () => {
    row('professional', 'hoa_720');
    const { features } = await getEffectiveFeaturesAndPlanForPage(1, 'hoa_720');
    expect(features.hasPackageLogging).toBe(false);
  });
});
