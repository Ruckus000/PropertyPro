/**
 * /api/v1/notice-consent — the signed-in owner's own consent to electronic notice.
 *
 * Pinned: 401 without a session; every verb acts on the caller's own id only;
 * only a unit owner may give; anyone may read or withdraw their own; demo grace
 * refuses writes before membership is checked.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '../../src/lib/api/errors';

const h = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  getNoticeConsentMock: vi.fn(),
  getConsentEmailMock: vi.fn(),
  giveNoticeConsentMock: vi.fn(),
  withdrawNoticeConsentMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: h.requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: h.requireCommunityMembershipMock }));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: h.assertNotDemoGraceMock }));
vi.mock('@/lib/services/notice-consent-service', () => ({
  getNoticeConsent: h.getNoticeConsentMock,
  getConsentEmail: h.getConsentEmailMock,
  giveNoticeConsent: h.giveNoticeConsentMock,
  withdrawNoticeConsent: h.withdrawNoticeConsentMock,
}));

import { DELETE, GET, POST } from '../../src/app/api/v1/notice-consent/route';

const OWNER = { role: 'resident', isUnitOwner: true, isAdmin: false };
const NONE = { consented: false, givenAt: null, version: null, email: null };

const call = (handler: (req: NextRequest) => Promise<Response>, method: string) =>
  handler(
    new NextRequest('http://localhost:3000/api/v1/notice-consent?communityId=7', {
      method,
      headers: { 'user-agent': 'UA/1', 'x-forwarded-for': '203.0.113.9' },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  h.requireAuthenticatedUserIdMock.mockResolvedValue('me');
  h.requireCommunityMembershipMock.mockResolvedValue(OWNER);
  h.assertNotDemoGraceMock.mockResolvedValue(undefined);
  h.getNoticeConsentMock.mockResolvedValue(NONE);
  h.getConsentEmailMock.mockResolvedValue('me@example.com');
  h.giveNoticeConsentMock.mockResolvedValue(undefined);
  h.withdrawNoticeConsentMock.mockResolvedValue(true);
});

describe('/api/v1/notice-consent', () => {
  it.each([
    ['GET', GET],
    ['POST', POST],
    ['DELETE', DELETE],
  ] as const)('%s is 401 without a session', async (method, handler) => {
    h.requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    expect((await call(handler, method)).status).toBe(401);
  });

  it('GET returns the caller\'s own state and current email', async () => {
    const res = await call(GET, 'GET');
    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ ...NONE, currentEmail: 'me@example.com' });
    expect(h.requireCommunityMembershipMock).toHaveBeenCalledWith(7, 'me');
    expect(h.getNoticeConsentMock).toHaveBeenCalledWith(7, 'me');
  });

  it('POST gives consent for the caller at their own email', async () => {
    expect((await call(POST, 'POST')).status).toBe(200);
    expect(h.giveNoticeConsentMock).toHaveBeenCalledWith({
      communityId: 7,
      userId: 'me',
      email: 'me@example.com',
      ipAddress: '203.0.113.9',
      userAgent: 'UA/1',
    });
  });

  it.each([
    ['a tenant', { role: 'resident', isUnitOwner: false, isAdmin: false }],
    ['a manager', { role: 'property_manager', isUnitOwner: false, isAdmin: true }],
  ])('POST is 403 for %s', async (_label, membership) => {
    h.requireCommunityMembershipMock.mockResolvedValueOnce(membership);
    expect((await call(POST, 'POST')).status).toBe(403);
    expect(h.giveNoticeConsentMock).not.toHaveBeenCalled();
  });

  it('DELETE withdraws the caller\'s own consent', async () => {
    expect((await call(DELETE, 'DELETE')).status).toBe(200);
    expect(h.withdrawNoticeConsentMock).toHaveBeenCalledWith(7, 'me', { ipAddress: '203.0.113.9', userAgent: 'UA/1' });
  });

  it.each([
    ['POST', POST],
    ['DELETE', DELETE],
  ] as const)('%s is refused by demo grace before membership is checked', async (method, handler) => {
    h.assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('demo'));
    expect((await call(handler, method)).status).toBe(403);
    expect(h.requireCommunityMembershipMock).not.toHaveBeenCalled();
  });
});
