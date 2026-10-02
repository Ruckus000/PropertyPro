/**
 * Website builder v4, Phase 4 — `/api/v1/pm/site/design` route tests.
 *
 * The authorization floor (role, plan, custom-colours plan, the demo grace
 * window) and the contract's refusals. The service is mocked; the draft merge
 * has its own suite (`site-design-service.test.ts`).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@/lib/api/errors';

const {
  getSiteDesignMock,
  saveDraftDesignMock,
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
  requireEntitledForAdminReadMock,
  requireRoleMock,
  assertNotDemoGraceMock,
} = vi.hoisted(() => ({
  getSiteDesignMock: vi.fn(),
  saveDraftDesignMock: vi.fn(),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  requireEntitledForAdminReadMock: vi.fn(),
  requireRoleMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
}));

vi.mock('@/lib/services/site-design-service', () => ({
  getSiteDesign: getSiteDesignMock,
  saveDraftDesign: saveDraftDesignMock,
}));
vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthMock }));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireMembershipMock,
}));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: requirePlanFeatureMock }));
vi.mock('@/lib/middleware/read-entitlement-guard', () => ({
  requireEntitledForAdminRead: requireEntitledForAdminReadMock,
}));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: assertNotDemoGraceMock }));
vi.mock('@/lib/api/role-guard', () => ({
  requireRole: requireRoleMock,
  PM_MANAGER_ROLES: ['property_manager', 'root_manager'],
}));

import { GET, PATCH } from '@/app/api/v1/pm/site/design/route';

const COMMUNITY_ID = 42;
const DESIGN = { live: { layoutId: 'tidewater' }, draft: {} };

function patchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/design', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue('user-1');
  requireMembershipMock.mockResolvedValue({ role: 'property_manager', communityId: COMMUNITY_ID });
  resolveEffectiveCommunityIdMock.mockImplementation((_req, id: number) => id);
  requirePlanFeatureMock.mockResolvedValue(undefined);
  requireEntitledForAdminReadMock.mockResolvedValue(undefined);
  requireRoleMock.mockReturnValue(undefined);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  getSiteDesignMock.mockResolvedValue(DESIGN);
  saveDraftDesignMock.mockResolvedValue(DESIGN);
});

describe('PATCH', () => {
  it('saves the draft for the effective community', async () => {
    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, primaryColor: '#112233' }));
    expect(res.status).toBe(200);
    expect(saveDraftDesignMock).toHaveBeenCalledWith(
      COMMUNITY_ID,
      { primaryColor: '#112233' },
      { actorUserId: 'user-1' },
    );
  });

  it('refuses a demo in its grace window before membership runs', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));
    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, primaryColor: '#112233' }));
    expect(res.status).toBe(403);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(requireMembershipMock).not.toHaveBeenCalled();
    expect(saveDraftDesignMock).not.toHaveBeenCalled();
  });

  it('refuses a non-manager role', async () => {
    requireRoleMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Only property managers can change the site design');
    });
    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, layoutId: 'tidewater' }));
    expect(res.status).toBe(403);
    expect(saveDraftDesignMock).not.toHaveBeenCalled();
  });

  it('needs the custom-colours plan feature for custom colours only', async () => {
    requirePlanFeatureMock.mockImplementation(async (_id: number, feature: string) => {
      if (feature === 'hasSiteCustomCss') throw new ForbiddenError('Professional feature');
    });
    const custom = await PATCH(
      patchRequest({ communityId: COMMUNITY_ID, customCssOverrides: null }),
    );
    expect(custom.status).toBe(403);
    const preset = await PATCH(patchRequest({ communityId: COMMUNITY_ID, themePresetSlug: 'bay-light' }));
    expect(preset.status).toBe(200);
  });

  it('rejects a bad colour and any other branding key', async () => {
    expect((await PATCH(patchRequest({ communityId: COMMUNITY_ID, primaryColor: 'red' }))).status).toBe(400);
    expect((await PATCH(patchRequest({ communityId: COMMUNITY_ID, logoPath: 'x.png' }))).status).toBe(400);
    expect(saveDraftDesignMock).not.toHaveBeenCalled();
  });
});

describe('GET', () => {
  it('reads the design without the write-only grace check', async () => {
    const res = await GET(
      new NextRequest(`http://localhost/api/v1/pm/site/design?communityId=${COMMUNITY_ID}`),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(DESIGN);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(requireEntitledForAdminReadMock).toHaveBeenCalled();
  });
});
