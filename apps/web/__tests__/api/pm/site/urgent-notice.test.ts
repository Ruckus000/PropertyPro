/**
 * Website editor v3, Phase 7 — `/api/v1/pm/site/urgent-notice` route tests.
 *
 * The §2.4 floor for a new endpoint is authorized / wrong-role / cross-tenant /
 * invalid input. This route earns two more because of what it does: it is
 * public with no review step, so the over-length case is tested against a
 * request the browser would never have produced, and the "site never published"
 * refusal is tested because a manager who believes residents were warned when
 * no page exists to warn them on is the failure that matters.
 *
 * The service is mocked here; its own guards are covered by the service's
 * behaviour surfacing as thrown errors, and the pure logic has its own suite.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { ConflictError, ForbiddenError, ValidationError } from '@/lib/api/errors';

const {
  getUrgentNoticeMock,
  setUrgentNoticeMock,
  clearUrgentNoticeMock,
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
  requireEntitledForAdminReadMock,
  requireRoleMock,
} = vi.hoisted(() => ({
  getUrgentNoticeMock: vi.fn(),
  setUrgentNoticeMock: vi.fn(),
  clearUrgentNoticeMock: vi.fn(),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  requireEntitledForAdminReadMock: vi.fn(),
  requireRoleMock: vi.fn(),
}));

vi.mock('@/lib/services/urgent-notice-service', () => ({
  getUrgentNotice: getUrgentNoticeMock,
  setUrgentNotice: setUrgentNoticeMock,
  clearUrgentNotice: clearUrgentNoticeMock,
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
// The real `requireRole` is kept in spirit but stubbed so a test can make it
// throw without constructing a full membership object.
vi.mock('@/lib/api/role-guard', () => ({
  requireRole: requireRoleMock,
  PM_MANAGER_ROLES: ['property_manager', 'root_manager'],
}));

import { GET, POST, DELETE } from '@/app/api/v1/pm/site/urgent-notice/route';

const COMMUNITY_ID = 42;
const FUTURE = '2099-01-01T00:00:00.000Z';

function postRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/urgent-notice', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function getRequest(communityId: number | string = COMMUNITY_ID): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/pm/site/urgent-notice?communityId=${communityId}`,
  );
}

function deleteRequest(communityId: number = COMMUNITY_ID): NextRequest {
  return new NextRequest(
    `http://localhost/api/v1/pm/site/urgent-notice?communityId=${communityId}`,
    { method: 'DELETE' },
  );
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
  getUrgentNoticeMock.mockResolvedValue(null);
  clearUrgentNoticeMock.mockResolvedValue(undefined);
  setUrgentNoticeMock.mockResolvedValue({
    text: 'Pool closed',
    expiresAt: new Date(FUTURE),
    setAt: new Date('2026-07-27T12:00:00.000Z'),
  });
});

describe('POST — authorized', () => {
  it('posts a notice and returns the serialized record', async () => {
    const res = await POST(postRequest({
      communityId: COMMUNITY_ID,
      text: 'Pool closed',
      expiresAt: FUTURE,
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.urgentNotice).toEqual({
      text: 'Pool closed',
      expiresAt: FUTURE,
      setAt: '2026-07-27T12:00:00.000Z',
    });
    expect(setUrgentNoticeMock).toHaveBeenCalledWith({
      communityId: COMMUNITY_ID,
      actorUserId: 'user-1',
      text: 'Pool closed',
      expiresAt: new Date(FUTURE),
    });
  });

  it('accepts a null expiry as "until I remove it"', async () => {
    setUrgentNoticeMock.mockResolvedValue({
      text: 'Boil water',
      expiresAt: null,
      setAt: new Date('2026-07-27T12:00:00.000Z'),
    });

    const res = await POST(postRequest({
      communityId: COMMUNITY_ID,
      text: 'Boil water',
      expiresAt: null,
    }));

    expect(res.status).toBe(200);
    expect(setUrgentNoticeMock).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: null }),
    );
  });

  it('enforces the same plan gate as publish', async () => {
    await POST(postRequest({ communityId: COMMUNITY_ID, text: 'x', expiresAt: null }));
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(COMMUNITY_ID, 'hasSiteEditor');
  });
});

describe('POST — authorization', () => {
  it('rejects a non-PM role with 403', async () => {
    requireRoleMock.mockImplementation(() => {
      throw new ForbiddenError('Only property managers can post an urgent notice');
    });

    const res = await POST(postRequest({
      communityId: COMMUNITY_ID,
      text: 'Pool closed',
      expiresAt: null,
    }));

    expect(res.status).toBe(403);
    expect(setUrgentNoticeMock).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated caller with 401', async () => {
    const { UnauthorizedError } = await import('@/lib/api/errors');
    requireAuthMock.mockRejectedValue(new UnauthorizedError('Not signed in'));

    const res = await POST(postRequest({
      communityId: COMMUNITY_ID,
      text: 'Pool closed',
      expiresAt: null,
    }));

    expect(res.status).toBe(401);
    expect(setUrgentNoticeMock).not.toHaveBeenCalled();
  });

  it('CROSS-TENANT: a body communityId that disagrees with the tenant header is refused', async () => {
    // `resolveEffectiveCommunityId` is the seam that catches this — the header
    // set by middleware wins, and a mismatch is not silently preferred one way
    // or the other. Without this, a manager of 42 could post to 999.
    resolveEffectiveCommunityIdMock.mockImplementation(() => {
      throw new ForbiddenError('Community mismatch');
    });

    const res = await POST(postRequest({
      communityId: 999,
      text: 'Pool closed',
      expiresAt: null,
    }));

    expect(res.status).toBe(403);
    expect(setUrgentNoticeMock).not.toHaveBeenCalled();
  });

  it('CROSS-TENANT: the service is called with the RESOLVED id, never the body id', async () => {
    // A manager of 42 sending communityId 999 must write to 42 — the resolved
    // value is what reaches the service, so a mismatch cannot become a write.
    resolveEffectiveCommunityIdMock.mockReturnValue(COMMUNITY_ID);

    await POST(postRequest({ communityId: 999, text: 'Pool closed', expiresAt: null }));

    expect(setUrgentNoticeMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: COMMUNITY_ID }),
    );
    expect(requireMembershipMock).toHaveBeenCalledWith(COMMUNITY_ID, 'user-1');
  });
});

describe('POST — invalid input', () => {
  it('rejects an over-length notice with 400 EVEN THOUGH maxLength would have stopped the browser', async () => {
    // The textarea caps at 240. This request did not come from the textarea.
    setUrgentNoticeMock.mockRejectedValue(
      new ValidationError('An urgent notice must be 240 characters or fewer.'),
    );

    const res = await POST(postRequest({
      communityId: COMMUNITY_ID,
      text: 'a'.repeat(241),
      expiresAt: null,
    }));

    expect(res.status).toBe(400);
  });

  it('rejects a grossly over-length notice at the schema boundary', async () => {
    const res = await POST(postRequest({
      communityId: COMMUNITY_ID,
      text: 'a'.repeat(5000),
      expiresAt: null,
    }));

    expect(res.status).toBe(400);
    expect(setUrgentNoticeMock).not.toHaveBeenCalled();
  });

  it('rejects empty text', async () => {
    const res = await POST(postRequest({
      communityId: COMMUNITY_ID,
      text: '   ',
      expiresAt: null,
    }));

    expect(res.status).toBe(400);
    expect(setUrgentNoticeMock).not.toHaveBeenCalled();
  });

  it('rejects a non-ISO expiry', async () => {
    const res = await POST(postRequest({
      communityId: COMMUNITY_ID,
      text: 'Pool closed',
      expiresAt: 'next tuesday',
    }));

    expect(res.status).toBe(400);
    expect(setUrgentNoticeMock).not.toHaveBeenCalled();
  });

  it('rejects an expiry already in the past', async () => {
    setUrgentNoticeMock.mockRejectedValue(
      new ValidationError('The expiry time must be in the future.'),
    );

    const res = await POST(postRequest({
      communityId: COMMUNITY_ID,
      text: 'Pool closed',
      expiresAt: '2020-01-01T00:00:00.000Z',
    }));

    expect(res.status).toBe(400);
  });

  it('rejects unknown body keys — the schema is strict', async () => {
    const res = await POST(postRequest({
      communityId: COMMUNITY_ID,
      text: 'Pool closed',
      expiresAt: null,
      urgentNoticeSetBy: 'someone-else',
    }));

    expect(res.status).toBe(400);
    expect(setUrgentNoticeMock).not.toHaveBeenCalled();
  });

  it('refuses when the site has never been published — nowhere to show it', async () => {
    setUrgentNoticeMock.mockRejectedValue(
      new ConflictError('Publish your website before posting an urgent notice'),
    );

    const res = await POST(postRequest({
      communityId: COMMUNITY_ID,
      text: 'Pool closed',
      expiresAt: null,
    }));

    expect(res.status).toBe(409);
  });
});

describe('GET', () => {
  it('returns the stored notice', async () => {
    getUrgentNoticeMock.mockResolvedValue({
      text: 'Pool closed',
      expiresAt: new Date(FUTURE),
      setAt: new Date('2026-07-27T12:00:00.000Z'),
    });

    const res = await GET(getRequest());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.urgentNotice.text).toBe('Pool closed');
  });

  it('returns null when nothing is posted', async () => {
    const res = await GET(getRequest());
    const json = await res.json();
    expect(json.data.urgentNotice).toBeNull();
  });

  it('is gated on read entitlement, so a lapsed community cannot read', async () => {
    const { AppError } = await import('@/lib/api/errors');
    requireEntitledForAdminReadMock.mockRejectedValue(
      new AppError('Subscription lapsed', 403, 'SUBSCRIPTION_REQUIRED'),
    );

    const res = await GET(getRequest());
    expect(res.status).toBe(403);
  });

  it('rejects a non-PM role with 403', async () => {
    requireRoleMock.mockImplementation(() => {
      throw new ForbiddenError('Only property managers can post an urgent notice');
    });

    const res = await GET(getRequest());
    expect(res.status).toBe(403);
    expect(getUrgentNoticeMock).not.toHaveBeenCalled();
  });

  it('rejects a missing communityId', async () => {
    const res = await GET(
      new NextRequest('http://localhost/api/v1/pm/site/urgent-notice'),
    );
    expect(res.status).toBe(400);
  });
});

describe('DELETE', () => {
  it('clears the notice', async () => {
    const res = await DELETE(deleteRequest());

    expect(res.status).toBe(200);
    expect(clearUrgentNoticeMock).toHaveBeenCalledWith({
      communityId: COMMUNITY_ID,
      actorUserId: 'user-1',
    });
  });

  it('rejects a non-PM role with 403', async () => {
    requireRoleMock.mockImplementation(() => {
      throw new ForbiddenError('Only property managers can post an urgent notice');
    });

    const res = await DELETE(deleteRequest());

    expect(res.status).toBe(403);
    expect(clearUrgentNoticeMock).not.toHaveBeenCalled();
  });

  it('CROSS-TENANT: clears the RESOLVED community, never the query one', async () => {
    resolveEffectiveCommunityIdMock.mockReturnValue(COMMUNITY_ID);

    await DELETE(deleteRequest(999));

    expect(clearUrgentNoticeMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: COMMUNITY_ID }),
    );
  });

  it('enforces the plan gate', async () => {
    await DELETE(deleteRequest());
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(COMMUNITY_ID, 'hasSiteEditor');
  });
});
