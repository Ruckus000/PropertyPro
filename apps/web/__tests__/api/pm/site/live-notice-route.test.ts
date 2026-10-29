/**
 * `POST` / `PATCH /api/v1/pm/site/live-notice` (website builder, D5): the
 * one-time "Email owners that the site is live" action.
 *
 * Deliberately NOT mocked: `@/lib/api/role-guard`, `@/lib/api/tenant-context`
 * and `@/lib/db/access-control`. All three are DB-free, and the point of the 403
 * case is that the REAL role check refuses a resident. The claim, the notifier
 * and the audit log are mocked so a call would be seen, not sent.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors';

const {
  claimMock,
  releaseMock,
  dismissMock,
  notifyMock,
  logAuditEventMock,
  requireAuthMock,
  requireMembershipMock,
  requirePlanFeatureMock,
  assertNotDemoGraceMock,
} = vi.hoisted(() => ({
  claimMock: vi.fn(),
  releaseMock: vi.fn(),
  dismissMock: vi.fn(),
  notifyMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
}));

vi.mock('@/lib/services/site-live-notice-service', () => ({
  claimSiteLiveNotice: claimMock,
  releaseSiteLiveNotice: releaseMock,
  dismissSiteLiveNotice: dismissMock,
}));
vi.mock('@/lib/services/site-publish-notification', () => ({
  notifyResidentsOfSitePublish: notifyMock,
}));
vi.mock('@propertypro/db', () => ({ logAuditEvent: logAuditEventMock }));
vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthMock }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: requireMembershipMock }));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: requirePlanFeatureMock }));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: assertNotDemoGraceMock }));

import { PATCH, POST } from '@/app/api/v1/pm/site/live-notice/route';

const COMMUNITY_ID = 42;

function request(method: 'POST' | 'PATCH', body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/live-notice', {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}
const post = (body: unknown = { communityId: COMMUNITY_ID }) => POST(request('POST', body));
const patch = (body: unknown = { communityId: COMMUNITY_ID, dismissed: true }) =>
  PATCH(request('PATCH', body));

const manager = (role = 'property_manager') => ({
  role,
  communityId: COMMUNITY_ID,
  communityType: 'condo_718',
  isAdmin: role !== 'resident',
  isUnitOwner: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue('user-1');
  requireMembershipMock.mockResolvedValue(manager());
  requirePlanFeatureMock.mockResolvedValue(undefined);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  claimMock.mockResolvedValue(true);
  releaseMock.mockResolvedValue(undefined);
  dismissMock.mockResolvedValue(undefined);
  logAuditEventMock.mockResolvedValue(undefined);
  notifyMock.mockResolvedValue({ status: 'sent', announcementId: 7, recipientCount: 31 });
});

describe('POST /api/v1/pm/site/live-notice', () => {
  it('sends once to owners and stamps sent_at', async () => {
    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { status: 'sent', recipientCount: 31 } });
    expect(claimMock).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(notifyMock).toHaveBeenCalledWith({
      communityId: COMMUNITY_ID,
      actorUserId: 'user-1',
      summary: 'Our community website is live',
      audience: 'owners_only',
    });
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('claims the send before making it', async () => {
    const order: string[] = [];
    claimMock.mockImplementation(async () => {
      order.push('claim');
      return true;
    });
    notifyMock.mockImplementation(async () => {
      order.push('notify');
      return { status: 'sent', announcementId: 7, recipientCount: 1 };
    });

    await post();

    expect(order).toEqual(['claim', 'notify']);
  });

  it('a second POST returns 409 and sends nothing', async () => {
    claimMock.mockResolvedValueOnce(true).mockResolvedValue(false);

    const first = await post();
    const second = await post();

    expect(first.status).toBe(200);
    expect(second.status).toBe(409);
    expect(notifyMock).toHaveBeenCalledTimes(1);
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('when two requests race, only the one that claims the row sends', async () => {
    // The database lets exactly one conditional UPDATE change the row; whichever
    // request the claim favours is the only one that may reach the notifier.
    let claimed = false;
    claimMock.mockImplementation(async () => {
      if (claimed) return false;
      claimed = true;
      return true;
    });

    const [a, b] = await Promise.all([post(), post()]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(notifyMock).toHaveBeenCalledTimes(1);
  });

  it('a failed send releases the claim and reports failed', async () => {
    notifyMock.mockResolvedValue({ status: 'failed', reason: 'smtp exploded' });

    const res = await post();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { status: 'failed', reason: 'smtp exploded' } });
    expect(releaseMock).toHaveBeenCalledWith(COMMUNITY_ID);
  });

  it('a partial send keeps the claim', async () => {
    notifyMock.mockResolvedValue({ status: 'partial', announcementId: 7, reason: 'resend 500' });

    const res = await post();

    expect(await res.json()).toEqual({ data: { status: 'partial', reason: 'resend 500' } });
    expect(releaseMock).not.toHaveBeenCalled();
  });

  it('a resident gets 403', async () => {
    requireMembershipMock.mockResolvedValue(manager('resident'));

    const res = await post();

    expect(res.status).toBe(403);
    for (const effect of [claimMock, notifyMock, releaseMock, logAuditEventMock]) {
      expect(effect).not.toHaveBeenCalled();
    }
  });

  it('refuses a signed-out caller', async () => {
    requireAuthMock.mockRejectedValue(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));

    const res = await post();

    expect(res.status).toBe(401);
    expect(claimMock).not.toHaveBeenCalled();
  });

  it('refuses a community without the site editor, before claiming', async () => {
    requirePlanFeatureMock.mockRejectedValue(new AppError('Upgrade', 403, 'PLAN_REQUIRED'));

    const res = await post();

    expect(res.status).toBe(403);
    expect(claimMock).not.toHaveBeenCalled();
  });

  it('a body naming another community is a 404 and sends nothing', async () => {
    const res = await POST(
      request('POST', { communityId: COMMUNITY_ID }, { 'x-community-id': '99' }),
    );

    expect(res.status).toBe(404);
    expect(claimMock).not.toHaveBeenCalled();
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('rejects a body with extra keys', async () => {
    const res = await post({ communityId: COMMUNITY_ID, summary: 'Free text' });

    expect(res.status).toBe(400);
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/pm/site/live-notice', () => {
  it('PATCH dismissed stamps dismissed_at', async () => {
    const res = await patch();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { ok: true } });
    expect(dismissMock).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: 'user-1',
      communityId: COMMUNITY_ID,
      action: 'update',
      resourceType: 'site_live_notice',
      resourceId: String(COMMUNITY_ID),
      newValues: { dismissed: true },
    });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('a resident gets 403 and nothing is dismissed', async () => {
    requireMembershipMock.mockResolvedValue(manager('resident'));

    const res = await patch();

    expect(res.status).toBe(403);
    expect(dismissMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('rejects dismissed: false', async () => {
    const res = await patch({ communityId: COMMUNITY_ID, dismissed: false });

    expect(res.status).toBe(400);
    expect(dismissMock).not.toHaveBeenCalled();
  });
});
