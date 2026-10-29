/**
 * Website builder, Phase 2B — `PATCH /api/v1/pm/site/look`; Phase 4 — `POST`
 * (publish a look in one click).
 *
 * The route is the manager's decision about the site's look, in two forms: draft
 * a look (`draftLookSwitch`) or keep the current one (`keepCurrent`). What a
 * switch does to the page is `site-look-service`'s business and has its own
 * suites; these pin the gate, the strict body, what the route calls and in which
 * order, and the audit row.
 *
 * Deliberately NOT mocked: `@/lib/api/role-guard` and `@/lib/api/tenant-context`.
 * Both are DB-free, and the point of the 403 case is that the REAL role check
 * refuses a resident — a mocked `requireRole` would assert nothing about the
 * route's own wiring.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError, ConflictError, ForbiddenError } from '@/lib/api/errors';

const {
  draftLookSwitchMock,
  markSiteOnboardingCompleteMock,
  tryAutoCompleteMock,
  logAuditEventMock,
  requireAuthMock,
  requireMembershipMock,
  requirePlanFeatureMock,
  assertNotDemoGraceMock,
  publishCommunitySiteMock,
  notifyResidentsMock,
} = vi.hoisted(() => ({
  publishCommunitySiteMock: vi.fn(),
  notifyResidentsMock: vi.fn(),
  draftLookSwitchMock: vi.fn(),
  markSiteOnboardingCompleteMock: vi.fn(),
  tryAutoCompleteMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
}));

vi.mock('@/lib/services/site-look-service', () => ({ draftLookSwitch: draftLookSwitchMock }));
vi.mock('@/lib/api/branding', () => ({ markSiteOnboardingComplete: markSiteOnboardingCompleteMock }));
vi.mock('@/lib/services/onboarding-checklist-service', () => ({ tryAutoComplete: tryAutoCompleteMock }));
vi.mock('@propertypro/db', () => ({ logAuditEvent: logAuditEventMock }));
vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthMock }));
vi.mock('@/lib/api/community-membership', () => ({ requireCommunityMembership: requireMembershipMock }));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: requirePlanFeatureMock }));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: assertNotDemoGraceMock }));
vi.mock('@/lib/services/site-blocks-service', () => ({ publishCommunitySite: publishCommunitySiteMock }));
// The route must never reach this: owners are emailed only by the website home's
// separate "Email owners" action. Mocked so a call would be seen, not sent.
vi.mock('@/lib/services/site-publish-notification', () => ({
  notifyResidentsOfSitePublish: notifyResidentsMock,
}));

import { PATCH, POST } from '@/app/api/v1/pm/site/look/route';

const COMMUNITY_ID = 42;
const COUNTS = { replaced: 3, kept: 1, added: 2, removed: 0 };

function patchRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/look', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function postRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/look', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const PUBLISHED_AT = new Date('2026-10-29T15:04:05.000Z');
const TOKEN = '2026-10-01T12:00:00.000Z';

/** Everything the route can write or trigger, in one list: for "nothing happened" assertions. */
const sideEffects = () => [
  draftLookSwitchMock,
  publishCommunitySiteMock,
  markSiteOnboardingCompleteMock,
  tryAutoCompleteMock,
  logAuditEventMock,
  notifyResidentsMock,
];

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthMock.mockResolvedValue('user-1');
  requireMembershipMock.mockResolvedValue({ role: 'property_manager', communityId: COMMUNITY_ID });
  requirePlanFeatureMock.mockResolvedValue(undefined);
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  draftLookSwitchMock.mockResolvedValue(COUNTS);
  markSiteOnboardingCompleteMock.mockResolvedValue(undefined);
  tryAutoCompleteMock.mockResolvedValue(undefined);
  logAuditEventMock.mockResolvedValue(undefined);
  publishCommunitySiteMock.mockResolvedValue({
    published: true,
    publishedAt: PUBLISHED_AT,
    promotedCount: 5,
    retiredCount: 4,
    addedPageCount: 0,
    removedPageCount: 0,
  });
});

describe('PATCH /api/v1/pm/site/look — the gate', () => {
  it('PATCH returns 403 for a resident', async () => {
    requireMembershipMock.mockResolvedValue({ role: 'resident', communityId: COMMUNITY_ID });

    const draft = await PATCH(patchRequest({ communityId: COMMUNITY_ID, lookId: 'heritage' }));
    const keep = await PATCH(patchRequest({ communityId: COMMUNITY_ID, keepCurrent: true }));

    expect(draft.status).toBe(403);
    expect(keep.status).toBe(403);
    for (const effect of sideEffects()) expect(effect).not.toHaveBeenCalled();
  });

  it('lets a root manager through, as a property manager', async () => {
    requireMembershipMock.mockResolvedValue({ role: 'root_manager', communityId: COMMUNITY_ID });

    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, lookId: 'heritage' }));

    expect(res.status).toBe(200);
  });

  it('refuses a signed-out caller', async () => {
    requireAuthMock.mockRejectedValue(new AppError('Unauthorized', 401, 'UNAUTHORIZED'));

    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, lookId: 'heritage' }));

    expect(res.status).toBe(401);
    for (const effect of sideEffects()) expect(effect).not.toHaveBeenCalled();
  });

  it('refuses someone who is not a member of the community, for both forms', async () => {
    // What `requireCommunityMembership` throws for a signed-in user with no seat here.
    requireMembershipMock.mockRejectedValue(new ForbiddenError('User is not a member of this community'));

    const draft = await PATCH(patchRequest({ communityId: COMMUNITY_ID, lookId: 'heritage' }));
    const keep = await PATCH(patchRequest({ communityId: COMMUNITY_ID, keepCurrent: true }));

    expect(draft.status).toBe(403);
    expect(keep.status).toBe(403);
    expect(requireMembershipMock).toHaveBeenCalledWith(COMMUNITY_ID, 'user-1');
    // Refused before the role and plan checks, and before anything is written.
    expect(requirePlanFeatureMock).not.toHaveBeenCalled();
    for (const effect of sideEffects()) expect(effect).not.toHaveBeenCalled();
  });

  it('refuses a demo in its grace window before membership runs', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, keepCurrent: true }));

    expect(res.status).toBe(403);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(requireMembershipMock).not.toHaveBeenCalled();
    for (const effect of sideEffects()) expect(effect).not.toHaveBeenCalled();
  });

  it('needs the website editor plan feature, for both forms', async () => {
    requirePlanFeatureMock.mockRejectedValue(new ForbiddenError('Upgrade to use the website editor'));

    const draft = await PATCH(patchRequest({ communityId: COMMUNITY_ID, lookId: 'heritage' }));
    const keep = await PATCH(patchRequest({ communityId: COMMUNITY_ID, keepCurrent: true }));

    expect(draft.status).toBe(403);
    expect(keep.status).toBe(403);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(COMMUNITY_ID, 'hasSiteEditor');
    for (const effect of sideEffects()) expect(effect).not.toHaveBeenCalled();
  });

  it('takes the community from the middleware header, and 404s a body that names another', async () => {
    const res = await PATCH(
      patchRequest({ communityId: COMMUNITY_ID, lookId: 'heritage' }, { 'x-community-id': '7' }),
    );

    expect(res.status).toBe(404);
    for (const effect of sideEffects()) expect(effect).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/pm/site/look — the body', () => {
  it('PATCH returns 400 for an unknown look', async () => {
    // `sable` is a layout, not a look: only the four looks can be drafted here.
    for (const lookId of ['nope', 'sable', '']) {
      const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, lookId }));
      expect(res.status).toBe(400);
    }
    for (const effect of sideEffects()) expect(effect).not.toHaveBeenCalled();
  });

  it.each([
    ['neither a look nor keepCurrent', { communityId: COMMUNITY_ID }],
    ['both a look and keepCurrent', { communityId: COMMUNITY_ID, lookId: 'heritage', keepCurrent: true }],
    ['keepCurrent: false', { communityId: COMMUNITY_ID, keepCurrent: false }],
    ['an unknown key beside a look', { communityId: COMMUNITY_ID, lookId: 'heritage', layoutId: 'sable' }],
    ['an unknown key beside keepCurrent', { communityId: COMMUNITY_ID, keepCurrent: true, primaryColor: '#000000' }],
    ['no communityId', { lookId: 'heritage' }],
  ])('rejects %s', async (_label, body) => {
    const res = await PATCH(patchRequest(body));

    expect(res.status).toBe(400);
    for (const effect of sideEffects()) expect(effect).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/pm/site/look — lookId', () => {
  it('PATCH lookId calls draftLookSwitch', async () => {
    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, lookId: 'heritage' }));

    expect(res.status).toBe(200);
    expect(draftLookSwitchMock).toHaveBeenCalledTimes(1);
    expect(draftLookSwitchMock).toHaveBeenCalledWith(COMMUNITY_ID, 'heritage', { actorUserId: 'user-1' });
    expect((await res.json()).data).toEqual(COUNTS);
  });

  it('is not the keep-current path: it marks neither onboarding nor the checklist', async () => {
    await PATCH(patchRequest({ communityId: COMMUNITY_ID, lookId: 'heritage' }));

    expect(markSiteOnboardingCompleteMock).not.toHaveBeenCalled();
    expect(tryAutoCompleteMock).not.toHaveBeenCalled();
  });

  it('audits the choice as an update of the site look', async () => {
    await PATCH(patchRequest({ communityId: COMMUNITY_ID, lookId: 'palm-grove' }));

    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: 'user-1',
      communityId: COMMUNITY_ID,
      action: 'update',
      resourceType: 'site_look',
      resourceId: String(COMMUNITY_ID),
      newValues: { lookId: 'palm-grove' },
    });
  });

  it('writes no audit row when the switch fails', async () => {
    draftLookSwitchMock.mockRejectedValueOnce(new AppError('Colour set missing', 422, 'UNPROCESSABLE'));

    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, lookId: 'heritage' }));

    expect(res.status).toBe(422);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/v1/pm/site/look — keepCurrent', () => {
  it('PATCH keepCurrent marks onboarding complete and the checklist item', async () => {
    const calls: string[] = [];
    markSiteOnboardingCompleteMock.mockImplementation(async () => void calls.push('onboarding'));
    tryAutoCompleteMock.mockImplementation(async () => void calls.push('checklist'));

    const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, keepCurrent: true }));

    expect(res.status).toBe(200);
    expect(markSiteOnboardingCompleteMock).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(tryAutoCompleteMock).toHaveBeenCalledWith(COMMUNITY_ID, 'user-1', 'customize_portal');
    expect(calls).toEqual(['onboarding', 'checklist']);
    expect((await res.json()).data).toEqual({ ok: true });
  });

  it('drafts nothing: the site keeps the look it has', async () => {
    await PATCH(patchRequest({ communityId: COMMUNITY_ID, keepCurrent: true }));

    expect(draftLookSwitchMock).not.toHaveBeenCalled();
  });

  it('audits the decision as an update of the site look', async () => {
    await PATCH(patchRequest({ communityId: COMMUNITY_ID, keepCurrent: true }));

    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: 'user-1',
      communityId: COMMUNITY_ID,
      action: 'update',
      resourceType: 'site_look',
      resourceId: String(COMMUNITY_ID),
      newValues: { keepCurrent: true },
    });
  });

  it('writes no audit row, and ticks no checklist item, when marking onboarding fails', async () => {
    markSiteOnboardingCompleteMock.mockRejectedValueOnce(new Error('db down'));
    // The error handler logs the failure it turns into a 500; keep it out of the run's output.
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await PATCH(patchRequest({ communityId: COMMUNITY_ID, keepCurrent: true }));

      expect(res.status).toBe(500);
      expect(logAuditEventMock).not.toHaveBeenCalled();
      expect(tryAutoCompleteMock).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe('POST /api/v1/pm/site/look — publish a look in one click', () => {
  it('POST switches, publishes, then marks onboarding and the checklist, in that order', async () => {
    const calls: string[] = [];
    draftLookSwitchMock.mockImplementation(async () => {
      calls.push('switch');
      return COUNTS;
    });
    publishCommunitySiteMock.mockImplementation(async () => {
      calls.push('publish');
      return { published: true, publishedAt: PUBLISHED_AT, promotedCount: 5, retiredCount: 4, addedPageCount: 0, removedPageCount: 0 };
    });
    markSiteOnboardingCompleteMock.mockImplementation(async () => void calls.push('onboarding'));
    tryAutoCompleteMock.mockImplementation(async () => void calls.push('checklist'));

    const res = await POST(
      postRequest({ communityId: COMMUNITY_ID, lookId: 'heritage', expectedPublishedAt: TOKEN }),
    );

    expect(res.status).toBe(200);
    expect(calls).toEqual(['switch', 'publish', 'onboarding', 'checklist']);
    expect(draftLookSwitchMock).toHaveBeenCalledWith(COMMUNITY_ID, 'heritage', { actorUserId: 'user-1' });
    expect(publishCommunitySiteMock).toHaveBeenCalledWith({
      communityId: COMMUNITY_ID,
      actorUserId: 'user-1',
      expectedPublishedAt: new Date(TOKEN),
    });
    expect(markSiteOnboardingCompleteMock).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(tryAutoCompleteMock).toHaveBeenCalledWith(COMMUNITY_ID, 'user-1', 'customize_portal');
    expect((await res.json()).data).toEqual({
      publishedAt: PUBLISHED_AT.toISOString(),
      lookId: 'heritage',
    });
  });

  it('POST never sends an owner email', async () => {
    const res = await POST(
      postRequest({ communityId: COMMUNITY_ID, lookId: 'bayfront', expectedPublishedAt: TOKEN }),
    );

    expect(res.status).toBe(200);
    expect(publishCommunitySiteMock).toHaveBeenCalledTimes(1);
    expect(notifyResidentsMock).not.toHaveBeenCalled();
  });

  it('POST returns 409 on a stale token', async () => {
    // What publishCommunitySite throws when another publish moved the token.
    publishCommunitySiteMock.mockRejectedValueOnce(
      new ConflictError('Another editor published changes while you were working. Reload the page and try again.'),
    );

    const res = await POST(
      postRequest({ communityId: COMMUNITY_ID, lookId: 'heritage', expectedPublishedAt: TOKEN }),
    );

    expect(res.status).toBe(409);
    // Nothing that follows a publish happens: the look is not the site's yet.
    expect(markSiteOnboardingCompleteMock).not.toHaveBeenCalled();
    expect(tryAutoCompleteMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('passes a null token through for a site never published', async () => {
    await POST(postRequest({ communityId: COMMUNITY_ID, lookId: 'heritage', expectedPublishedAt: null }));

    expect(publishCommunitySiteMock).toHaveBeenCalledWith(
      expect.objectContaining({ expectedPublishedAt: null }),
    );
  });

  it('answers publishedAt null when the live look had nothing to publish, and still marks the choice', async () => {
    publishCommunitySiteMock.mockResolvedValueOnce({ published: false, reason: 'nothing-to-publish' });

    const res = await POST(
      postRequest({ communityId: COMMUNITY_ID, lookId: 'bayfront', expectedPublishedAt: TOKEN }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).data).toEqual({ publishedAt: null, lookId: 'bayfront' });
    expect(markSiteOnboardingCompleteMock).toHaveBeenCalledWith(COMMUNITY_ID);
    expect(tryAutoCompleteMock).toHaveBeenCalledWith(COMMUNITY_ID, 'user-1', 'customize_portal');
  });

  it('audits the publish as an update of the site look', async () => {
    await POST(postRequest({ communityId: COMMUNITY_ID, lookId: 'palm-grove', expectedPublishedAt: TOKEN }));

    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
    expect(logAuditEventMock).toHaveBeenCalledWith({
      userId: 'user-1',
      communityId: COMMUNITY_ID,
      action: 'update',
      resourceType: 'site_look',
      resourceId: String(COMMUNITY_ID),
      newValues: { lookId: 'palm-grove', publishedAt: PUBLISHED_AT.toISOString() },
    });
  });

  it('is gated like PATCH: a resident is refused and nothing is written', async () => {
    requireMembershipMock.mockResolvedValue({ role: 'resident', communityId: COMMUNITY_ID });

    const res = await POST(
      postRequest({ communityId: COMMUNITY_ID, lookId: 'heritage', expectedPublishedAt: TOKEN }),
    );

    expect(res.status).toBe(403);
    for (const effect of sideEffects()) expect(effect).not.toHaveBeenCalled();
  });

  it('refuses a demo in its grace window, and a plan without the website editor', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));
    const demo = await POST(
      postRequest({ communityId: COMMUNITY_ID, lookId: 'heritage', expectedPublishedAt: TOKEN }),
    );
    requirePlanFeatureMock.mockRejectedValueOnce(new ForbiddenError('Upgrade to use the website editor'));
    const plan = await POST(
      postRequest({ communityId: COMMUNITY_ID, lookId: 'heritage', expectedPublishedAt: TOKEN }),
    );

    expect(demo.status).toBe(403);
    expect(plan.status).toBe(403);
    expect(requirePlanFeatureMock).toHaveBeenCalledWith(COMMUNITY_ID, 'hasSiteEditor');
    for (const effect of sideEffects()) expect(effect).not.toHaveBeenCalled();
  });

  it('404s a body that names another community than the middleware header', async () => {
    const res = await POST(
      postRequest(
        { communityId: COMMUNITY_ID, lookId: 'heritage', expectedPublishedAt: TOKEN },
        { 'x-community-id': '7' },
      ),
    );

    expect(res.status).toBe(404);
    for (const effect of sideEffects()) expect(effect).not.toHaveBeenCalled();
  });

  it.each([
    ['an unknown look', { communityId: COMMUNITY_ID, lookId: 'sable', expectedPublishedAt: TOKEN }],
    ['no token key', { communityId: COMMUNITY_ID, lookId: 'heritage' }],
    ['a token that is not a timestamp', { communityId: COMMUNITY_ID, lookId: 'heritage', expectedPublishedAt: 'yesterday' }],
    ['an email request', {
      communityId: COMMUNITY_ID,
      lookId: 'heritage',
      expectedPublishedAt: TOKEN,
      notifyResidents: { summary: 'New look' },
    }],
  ])('rejects %s', async (_label, body) => {
    const res = await POST(postRequest(body));

    expect(res.status).toBe(400);
    for (const effect of sideEffects()) expect(effect).not.toHaveBeenCalled();
  });
});
