/**
 * Website editor v3, Phase 8 — `/api/v1/pm/site/settings` route tests.
 *
 * The §2.4 floor for a new endpoint is authorized / wrong-role / cross-tenant /
 * invalid input. This route earns more because of what it writes: these values
 * reach the live public site with no review step, so the over-length case is
 * tested against a request the browser's `maxLength` would never have produced,
 * and `.strict()` is tested against an attempt to reach a sibling branding key
 * through this endpoint.
 *
 * The service is mocked; its caps and merge behaviour have their own suite.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { SEO_TITLE_MAX_LENGTH } from '@/lib/site-editor/site-settings';

const {
  getSiteSettingsMock,
  updateSiteSettingsMock,
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
  requireEntitledForAdminReadMock,
  requireRoleMock,
} = vi.hoisted(() => ({
  getSiteSettingsMock: vi.fn(),
  updateSiteSettingsMock: vi.fn(),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  requireEntitledForAdminReadMock: vi.fn(),
  requireRoleMock: vi.fn(),
}));

vi.mock('@/lib/services/site-settings-service', () => ({
  getSiteSettings: getSiteSettingsMock,
  updateSiteSettings: updateSiteSettingsMock,
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
vi.mock('@/lib/api/role-guard', () => ({
  requireRole: requireRoleMock,
  PM_MANAGER_ROLES: ['property_manager', 'root_manager'],
}));

import { GET, PATCH } from '@/app/api/v1/pm/site/settings/route';

const COMMUNITY_ID = 42;

const RECORD = {
  settings: {
    seoTitle: 'Custom title',
    seoDescription: null,
    searchIndexing: true,
    favicon: null,
  },
  footer: { associationName: null, note: null, showStatutoryLine: false },
};

function patchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/settings', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function getRequest(communityId: number | string = COMMUNITY_ID): NextRequest {
  return new NextRequest(`http://localhost/api/v1/pm/site/settings?communityId=${communityId}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue('user-1');
  requireMembershipMock.mockResolvedValue({
    role: 'property_manager',
    communityId: COMMUNITY_ID,
    isAdmin: true,
  });
  resolveEffectiveCommunityIdMock.mockImplementation((_req, id: number) => id);
  requirePlanFeatureMock.mockResolvedValue(undefined);
  requireEntitledForAdminReadMock.mockResolvedValue(undefined);
  requireRoleMock.mockReturnValue(undefined);
  getSiteSettingsMock.mockResolvedValue(RECORD);
  updateSiteSettingsMock.mockResolvedValue(RECORD);
});

describe('GET — authorized', () => {
  it('returns the settings and footer', async () => {
    const res = await GET(getRequest());
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual(RECORD);
  });

  it('gates the read on entitlement — a lapsed community cannot read', async () => {
    requireEntitledForAdminReadMock.mockRejectedValue(new ForbiddenError('Subscription lapsed'));
    const res = await GET(getRequest());
    expect(res.status).toBe(403);
  });

  it('rejects a non-numeric communityId', async () => {
    const res = await GET(getRequest('not-a-number'));
    expect(res.status).toBe(400);
    expect(getSiteSettingsMock).not.toHaveBeenCalled();
  });
});

describe('PATCH — authorized', () => {
  it('forwards every field, distinguishing absent from null', async () => {
    const res = await PATCH(
      patchRequest({
        communityId: COMMUNITY_ID,
        seoTitle: 'Custom title',
        seoDescription: null,
        showStatutoryLine: true,
      }),
    );

    expect(res.status).toBe(200);
    expect(updateSiteSettingsMock).toHaveBeenCalledWith({
      communityId: COMMUNITY_ID,
      actorUserId: 'user-1',
      seoTitle: 'Custom title',
      seoDescription: null,
      searchIndexing: undefined,
      associationName: undefined,
      note: undefined,
      showStatutoryLine: true,
    });
  });

  it('accepts the indexing flag in both positions', async () => {
    await PATCH(patchRequest({ communityId: COMMUNITY_ID, searchIndexing: false }));
    expect(updateSiteSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ searchIndexing: false }),
    );
  });

  it('accepts a PATCH carrying only communityId as a no-op', async () => {
    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID }));
    expect(res.status).toBe(200);
  });
});

describe('PATCH — authorization', () => {
  it('rejects a non-manager', async () => {
    requireRoleMock.mockImplementation(() => {
      throw new ForbiddenError('Only property managers can change site settings');
    });
    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, seoTitle: 'x' }));
    expect(res.status).toBe(403);
    expect(updateSiteSettingsMock).not.toHaveBeenCalled();
  });

  it('rejects a community without the site-editor plan feature', async () => {
    requirePlanFeatureMock.mockRejectedValue(new ForbiddenError('Plan does not include this'));
    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, seoTitle: 'x' }));
    expect(res.status).toBe(403);
    expect(updateSiteSettingsMock).not.toHaveBeenCalled();
  });

  // The header wins. A manager of community 42 who edits the body to say 99
  // must not reach 99 — resolveEffectiveCommunityId is what enforces that, and
  // the handler must pass the value it returns, not the one it was sent.
  it('cross-tenant: the resolved community id is what reaches the service', async () => {
    resolveEffectiveCommunityIdMock.mockReturnValue(COMMUNITY_ID);
    await PATCH(patchRequest({ communityId: 99, seoTitle: 'x' }));

    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), 99);
    expect(updateSiteSettingsMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: COMMUNITY_ID }),
    );
  });

  it('cross-tenant: a mismatch rejected by the resolver never reaches the service', async () => {
    resolveEffectiveCommunityIdMock.mockImplementation(() => {
      throw new ForbiddenError('Community mismatch');
    });
    const res = await PATCH(patchRequest({ communityId: 99, seoTitle: 'x' }));
    expect(res.status).toBe(403);
    expect(updateSiteSettingsMock).not.toHaveBeenCalled();
  });
});

describe('PATCH — input validation', () => {
  it('rejects a missing communityId', async () => {
    const res = await PATCH(patchRequest({ seoTitle: 'x' }));
    expect(res.status).toBe(400);
    expect(updateSiteSettingsMock).not.toHaveBeenCalled();
  });

  it('rejects a non-boolean indexing flag', async () => {
    const res = await PATCH(
      patchRequest({ communityId: COMMUNITY_ID, searchIndexing: 'false' }),
    );
    expect(res.status).toBe(400);
    expect(updateSiteSettingsMock).not.toHaveBeenCalled();
  });

  // `.strict()` is the mass-assignment guard. `assetsBytesUsed` is a real
  // sibling key in the same jsonb blob — quota accounting — and this route must
  // not be a way to reach it.
  it.each(['assetsBytesUsed', 'primaryColor', 'logoPath', 'customCssOverrides'])(
    'rejects the unknown/sibling branding key %s',
    async (key) => {
      const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, [key]: 'x' }));
      expect(res.status).toBe(400);
      expect(updateSiteSettingsMock).not.toHaveBeenCalled();
    },
  );

  // The schema's ceiling is MAX*2 UTF-16 units so astral characters survive to
  // the service; anything past that is refused here. Either way the browser's
  // `maxLength` is irrelevant — this request never came from the form.
  it('rejects a title past the schema ceiling outright', async () => {
    const res = await PATCH(
      patchRequest({
        communityId: COMMUNITY_ID,
        seoTitle: 'a'.repeat(SEO_TITLE_MAX_LENGTH * 2 + 1),
      }),
    );
    expect(res.status).toBe(400);
    expect(updateSiteSettingsMock).not.toHaveBeenCalled();
  });

  // Between the schema ceiling and the real cap, the SERVICE is what refuses —
  // proving the server-side check is not the schema's `.max()` alone.
  it('surfaces the service’s code-point cap as a 400', async () => {
    updateSiteSettingsMock.mockRejectedValue(
      new ValidationError('A site title must be 60 characters or fewer.', {
        fields: [{ field: 'seoTitle', message: 'too long' }],
      }),
    );

    const res = await PATCH(
      patchRequest({
        communityId: COMMUNITY_ID,
        seoTitle: 'a'.repeat(SEO_TITLE_MAX_LENGTH + 1),
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.message).toContain('60 characters or fewer');
  });
});
