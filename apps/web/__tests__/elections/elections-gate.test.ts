/**
 * requireElectionsEnabled is the whole elections gate (audit #15, T-03).
 *
 * #1368 added plan gates to the other plan-tiered features but missed
 * elections: the helper checked community type and attorney review, never the
 * plan, so an Essentials condo would get Professional e-voting through the API
 * the day counsel cleared it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../../src/lib/api/errors/AppError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const { requirePlanFeatureMock } = vi.hoisted(() => ({ requirePlanFeatureMock: vi.fn() }));

vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: requirePlanFeatureMock }));

import { requireElectionsEnabled } from '../../src/lib/elections/common';
import type { CommunityMembership } from '../../src/lib/api/community-membership';

const CONDO = {
  communityId: 42,
  communityType: 'condo_718',
  electionsAttorneyReviewed: true,
} as CommunityMembership;

beforeEach(() => {
  requirePlanFeatureMock.mockReset();
  requirePlanFeatureMock.mockResolvedValue(undefined);
});

describe('requireElectionsEnabled', () => {
  it('requires the hasVoting plan feature for the membership community', async () => {
    await expect(requireElectionsEnabled(CONDO)).resolves.toBeUndefined();
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(42, 'hasVoting');
  });

  it('refuses a community whose plan lacks voting', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new AppError('This feature requires the Professional plan', 403, 'PLAN_UPGRADE_REQUIRED'),
    );
    await expect(requireElectionsEnabled(CONDO)).rejects.toMatchObject({
      statusCode: 403,
      code: 'PLAN_UPGRADE_REQUIRED',
    });
  });

  it('still refuses by community type and attorney review first, without a plan read', async () => {
    await expect(
      requireElectionsEnabled({ ...CONDO, communityType: 'apartment' } as CommunityMembership),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      requireElectionsEnabled({ ...CONDO, electionsAttorneyReviewed: false } as CommunityMembership),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
  });
});
