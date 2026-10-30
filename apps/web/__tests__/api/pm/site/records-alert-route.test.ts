/**
 * Website builder, D11 — `GET` and `PATCH /api/v1/pm/site/records-alert`.
 *
 * The count is the REAL `missingRecordItems` over a mocked checklist, so what is
 * counted (and what is not: conditional items, ones marked "doesn't apply",
 * posted records, every community below the statute's size threshold) is
 * asserted on its output rather than on a mock.
 *
 * Deliberately NOT mocked: `@/lib/api/role-guard` and `@/lib/api/tenant-context`.
 * Both are DB-free, and the 403 and the header-mismatch cases are about the
 * route's real wiring.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '@/lib/api/errors';

const {
  loadChecklistMock,
  unitCountMock,
  getPreferenceMock,
  mergePreferenceMock,
  requireAuthMock,
  requireMembershipMock,
  requirePlanFeatureMock,
  requireEntitledMock,
  assertNotDemoGraceMock,
} = vi.hoisted(() => ({
  loadChecklistMock: vi.fn(),
  unitCountMock: vi.fn(),
  getPreferenceMock: vi.fn(),
  mergePreferenceMock: vi.fn(),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  requireEntitledMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
}));

vi.mock('@/lib/compliance/load-checklist-with-status', () => ({
  loadChecklistWithStatus: loadChecklistMock,
}));
vi.mock('@/lib/services/community-profile-service', () => ({
  getCommunityUnitCount: unitCountMock,
}));
vi.mock('@/lib/services/user-preferences-service', () => ({
  getUserPreference: getPreferenceMock,
  mergeUserPreference: mergePreferenceMock,
}));
vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthMock }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: requireMembershipMock }));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: requirePlanFeatureMock }));
vi.mock('@/lib/middleware/read-entitlement-guard', () => ({
  requireEntitledForAdminRead: requireEntitledMock,
}));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: assertNotDemoGraceMock }));

import { GET, PATCH } from '@/app/api/v1/pm/site/records-alert/route';

const COMMUNITY_ID = 42;
const NOW = new Date('2026-10-29T15:00:00.000Z');
const SEVEN_DAYS_LATER = '2026-11-05T15:00:00.000Z';

function item(over: Record<string, unknown>) {
  return {
    id: 1,
    templateKey: '718_budget',
    title: 'Annual budget',
    category: 'financial_records',
    isApplicable: true,
    isConditional: false,
    documentId: null,
    documentState: null,
    status: 'unsatisfied',
    ...over,
  };
}

/** Two missing (nothing posted, a draft); everything else is not counted. */
const CHECKLIST = [
  item({ id: 1 }),
  item({ id: 2, templateKey: '718_minutes', title: 'Meeting minutes', documentId: 9, documentState: 'draft' }),
  item({ id: 3, templateKey: '718_bylaws', title: 'Bylaws', documentId: 8, documentState: 'posted', status: 'satisfied' }),
  item({ id: 4, templateKey: '718_sirs', title: 'SIRS', isConditional: true }),
  item({ id: 5, templateKey: '718_insurance', title: 'Insurance', isApplicable: false, status: 'not_applicable' }),
];

function getRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost/api/v1/pm/site/records-alert?communityId=${COMMUNITY_ID}`, { headers });
}

function patchRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/records-alert', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  requireAuthMock.mockResolvedValue('user-1');
  requireMembershipMock.mockResolvedValue({
    role: 'property_manager',
    communityId: COMMUNITY_ID,
    communityType: 'condo_718',
    isAdmin: true,
  });
  requirePlanFeatureMock.mockResolvedValue(undefined);
  requireEntitledMock.mockResolvedValue(undefined);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  loadChecklistMock.mockResolvedValue(CHECKLIST);
  unitCountMock.mockResolvedValue(40);
  getPreferenceMock.mockResolvedValue(null);
  mergePreferenceMock.mockResolvedValue(undefined);
});

describe('GET /api/v1/pm/site/records-alert', () => {
  it('GET counts missing records for a covered condo and returns 0 below the threshold', async () => {
    const covered = await GET(getRequest());
    expect(covered.status).toBe(200);
    expect((await covered.json()).data).toEqual({ snoozedUntil: null, missingCount: 2 });
    expect(loadChecklistMock).toHaveBeenCalledWith(COMMUNITY_ID, 'condo_718');

    // The same checklist in a 10-unit condo: the statute does not reach it.
    unitCountMock.mockResolvedValue(10);
    const small = await GET(getRequest());
    expect((await small.json()).data).toEqual({ snoozedUntil: null, missingCount: 0 });

    // An unknown count counts as covered.
    unitCountMock.mockResolvedValue(null);
    const unknown = await GET(getRequest());
    expect((await unknown.json()).data.missingCount).toBe(2);
  });

  it('counts nothing for an apartment community', async () => {
    requireMembershipMock.mockResolvedValue({
      role: 'property_manager',
      communityId: COMMUNITY_ID,
      communityType: 'apartment',
      isAdmin: true,
    });
    loadChecklistMock.mockResolvedValue([]);

    const res = await GET(getRequest());

    expect((await res.json()).data.missingCount).toBe(0);
  });

  it('returns the manager\'s own snooze while it is in force, and null once it has run out', async () => {
    getPreferenceMock.mockResolvedValue({ snoozedUntil: SEVEN_DAYS_LATER });
    const active = await GET(getRequest());
    expect((await active.json()).data.snoozedUntil).toBe(SEVEN_DAYS_LATER);
    expect(getPreferenceMock).toHaveBeenCalledWith('user-1', `site_records_alert:${COMMUNITY_ID}`);

    getPreferenceMock.mockResolvedValue({ snoozedUntil: '2026-10-01T00:00:00.000Z' });
    const expired = await GET(getRequest());
    expect((await expired.json()).data.snoozedUntil).toBeNull();

    // Anything else under the key is ignored rather than passed through.
    getPreferenceMock.mockResolvedValue({ snoozedUntil: 12345 });
    const junk = await GET(getRequest());
    expect((await junk.json()).data.snoozedUntil).toBeNull();
  });

  it('is an admin read: a lapsed community is refused, and its checklist is never read', async () => {
    requireEntitledMock.mockRejectedValue(new ForbiddenError('lapsed'));

    const res = await GET(getRequest());

    expect(res.status).toBe(403);
    expect(requireEntitledMock).toHaveBeenCalledWith(COMMUNITY_ID, expect.objectContaining({ isAdmin: true }));
    expect(loadChecklistMock).not.toHaveBeenCalled();
  });

  it('refuses a resident, and does not run the write-only grace check', async () => {
    requireMembershipMock.mockResolvedValue({ role: 'resident', communityId: COMMUNITY_ID });

    const res = await GET(getRequest());

    expect(res.status).toBe(403);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(loadChecklistMock).not.toHaveBeenCalled();
  });

  it('needs the website editor plan feature', async () => {
    requirePlanFeatureMock.mockRejectedValue(new ForbiddenError('Upgrade to use the website editor'));

    const res = await GET(getRequest());

    expect(res.status).toBe(403);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(COMMUNITY_ID, 'hasSiteEditor');
  });

  it('404s a query that names a community other than the middleware header\'s', async () => {
    const res = await GET(getRequest({ 'x-community-id': '7' }));

    expect(res.status).toBe(404);
    expect(loadChecklistMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/pm/site/records-alert', () => {
  it('snooze is stored per user, for seven days', async () => {
    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, snoozeDays: 7 }));

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ snoozedUntil: SEVEN_DAYS_LATER });
    expect(mergePreferenceMock).toHaveBeenCalledTimes(1);
    expect(mergePreferenceMock).toHaveBeenCalledWith('user-1', `site_records_alert:${COMMUNITY_ID}`, {
      snoozedUntil: SEVEN_DAYS_LATER,
    });
  });

  it('accepts exactly seven days and nothing else in the body', async () => {
    const other = await PATCH(patchRequest({ communityId: COMMUNITY_ID, snoozeDays: 14 }));
    const extra = await PATCH(patchRequest({ communityId: COMMUNITY_ID, snoozeDays: 7, userId: 'someone-else' }));
    const none = await PATCH(patchRequest({ communityId: COMMUNITY_ID }));

    expect(other.status).toBe(400);
    expect(extra.status).toBe(400);
    expect(none.status).toBe(400);
    expect(mergePreferenceMock).not.toHaveBeenCalled();
  });

  it('refuses a resident and writes nothing', async () => {
    requireMembershipMock.mockResolvedValue({ role: 'resident', communityId: COMMUNITY_ID });

    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, snoozeDays: 7 }));

    expect(res.status).toBe(403);
    expect(mergePreferenceMock).not.toHaveBeenCalled();
  });

  it('refuses a demo in its grace window before membership runs', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, snoozeDays: 7 }));

    expect(res.status).toBe(403);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(requireMembershipMock).not.toHaveBeenCalled();
    expect(mergePreferenceMock).not.toHaveBeenCalled();
  });

  it('404s a body that names a community other than the middleware header\'s', async () => {
    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, snoozeDays: 7 }, { 'x-community-id': '7' }));

    expect(res.status).toBe(404);
    expect(mergePreferenceMock).not.toHaveBeenCalled();
  });
});
