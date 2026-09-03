/**
 * The e-sign route gates, against the REAL RBAC matrix.
 *
 * `esign` read is granted to owner and tenant (`packages/shared/src/rbac-matrix.ts`)
 * because residents need to see what awaits their own signature. Six admin-facing
 * read routes then used that permission as though it were an admin gate, which is
 * how a resident could reach every signer's `slug` — a bearer token for the public,
 * session-less signing page — plus presigned URLs for signed PDFs and the whole
 * template library.
 *
 * Only `requirePlanFeature` is mocked here: it reaches the database, and the
 * question these tests ask is about the matrix, not about billing.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CommunityRole, CommunityType } from '@propertypro/shared';

const { requirePlanFeatureMock } = vi.hoisted(() => ({
  requirePlanFeatureMock: vi.fn(),
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

import {
  requireEsignManagementRead,
  requireEsignReadPermission,
  requireEsignWritePermission,
} from '@/lib/esign/esign-route-helpers';
import type { CommunityMembership } from '@/lib/api/community-membership';

function membership(
  role: CommunityRole,
  opts?: { isUnitOwner?: boolean; communityType?: CommunityType },
): CommunityMembership {
  return {
    userId: 'user-1',
    communityId: 42,
    communityName: 'Sunset Condos',
    role,
    communityType: opts?.communityType ?? 'condo_718',
    subscriptionPlan: 'professional',
    subscriptionStatus: 'active',
    subscriptionCanceledAt: null,
    subscriptionCurrentPeriodEndAt: null,
    freeAccessExpiresAt: null,
    timezone: 'America/New_York',
    isUnitOwner: opts?.isUnitOwner ?? false,
  } as CommunityMembership;
}

const OWNER = membership('resident', { isUnitOwner: true });
const TENANT = membership('resident', { isUnitOwner: false });
const PROPERTY_MANAGER = membership('property_manager');
const ROOT_MANAGER = membership('root_manager');

beforeEach(() => {
  vi.clearAllMocks();
  requirePlanFeatureMock.mockResolvedValue(undefined);
});

describe('requireEsignManagementRead', () => {
  it('admits both management roles', async () => {
    await expect(requireEsignManagementRead(PROPERTY_MANAGER)).resolves.toBeUndefined();
    await expect(requireEsignManagementRead(ROOT_MANAGER)).resolves.toBeUndefined();
  });

  it('refuses a unit owner', async () => {
    // The owner row grants esign READ. That is what made every admin-facing
    // read route reachable by any resident.
    await expect(requireEsignManagementRead(OWNER)).rejects.toThrow(/not permitted/i);
  });

  it('refuses a tenant', async () => {
    await expect(requireEsignManagementRead(TENANT)).rejects.toThrow(/not permitted/i);
  });

  it('gates on the same row as the write permission', async () => {
    // The E-Sign pages redirect anyone `isAdminRole` rejects, and that resolves
    // to the same `manager` matrix row `esign:write` uses. If these two ever
    // disagree, the API is once again more permissive than its own screen.
    for (const m of [OWNER, TENANT, PROPERTY_MANAGER, ROOT_MANAGER]) {
      const readOutcome = await requireEsignManagementRead(m).then(
        () => 'allowed',
        () => 'refused',
      );
      const writeOutcome = await requireEsignWritePermission(m).then(
        () => 'allowed',
        () => 'refused',
      );
      expect(readOutcome).toBe(writeOutcome);
    }
  });
});

describe('requireEsignReadPermission', () => {
  it('still admits residents — my-pending and consent depend on it', async () => {
    // The fix must not take away the one thing this permission legitimately
    // grants: a resident seeing their own pending signature.
    await expect(requireEsignReadPermission(OWNER)).resolves.toBeUndefined();
    await expect(requireEsignReadPermission(TENANT)).resolves.toBeUndefined();
  });
});
