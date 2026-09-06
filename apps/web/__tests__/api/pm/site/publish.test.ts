import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError, ConflictError } from '@/lib/api/errors';
import { SITE_PUBLISH_SUMMARY_MAX_LENGTH } from '@/lib/site-editor/publish-notification';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  publishMock,
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
  markOnboardingCompleteMock,
  notifyResidentsMock,
  requirePermissionMock,
} = vi.hoisted(() => ({
  publishMock: vi.fn(),
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  markOnboardingCompleteMock: vi.fn(),
  notifyResidentsMock: vi.fn(),
  requirePermissionMock: vi.fn(),
}));

vi.mock('@/lib/services/site-blocks-service', () => ({
  publishCommunitySite: publishMock,
}));

vi.mock('@/lib/api/branding', () => ({
  markSiteOnboardingComplete: markOnboardingCompleteMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@/lib/services/site-publish-notification', () => ({
  notifyResidentsOfSitePublish: notifyResidentsMock,
}));

// Mocked rather than exercised for real: `access-control` reaches the database
// at module load, which would fail every case in this file with
// "Missing DATABASE_URL" long before any assertion ran. The matrix itself is
// covered by the RBAC suite; what matters here is only WHETHER the route
// consults it, and on which path.
vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
  checkPermissionV2: vi.fn(() => true),
}));

import { POST } from '@/app/api/v1/pm/site/publish/route';

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/publish', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

const VALID_BODY = {
  communityId: 42,
  expectedPublishedAt: '2026-05-01T10:00:00.000Z',
};

describe('POST /api/v1/pm/site/publish', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'property_manager', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    markOnboardingCompleteMock.mockResolvedValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    notifyResidentsMock.mockResolvedValue({
      status: 'sent',
      announcementId: 7,
      recipientCount: 12,
    });
  });

  it('200s and forwards the parsed expectedPublishedAt as a Date to publishCommunitySite', async () => {
    publishMock.mockResolvedValueOnce({
      published: true,
      publishedAt: new Date('2026-05-15T12:00:00.000Z'),
      promotedCount: 3,
      retiredCount: 5,
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(publishMock).toHaveBeenCalledTimes(1);
    const args = publishMock.mock.calls[0]![0];
    expect(args.communityId).toBe(42);
    expect(args.actorUserId).toBe('user-1');
    expect(args.expectedPublishedAt).toBeInstanceOf(Date);
    expect((args.expectedPublishedAt as Date).toISOString()).toBe('2026-05-01T10:00:00.000Z');
  });

  it('passes expectedPublishedAt=null through unchanged for a first-ever publish', async () => {
    publishMock.mockResolvedValueOnce({
      published: true,
      publishedAt: new Date(),
      promotedCount: 1,
      retiredCount: 0,
    });
    const res = await POST(
      makeRequest({ communityId: 42, expectedPublishedAt: null }),
    );
    expect(res.status).toBe(200);
    expect(publishMock.mock.calls[0]![0].expectedPublishedAt).toBeNull();
  });

  it('returns the service result body verbatim (published path)', async () => {
    publishMock.mockResolvedValueOnce({
      published: true,
      publishedAt: new Date('2026-05-15T12:00:00.000Z'),
      promotedCount: 3,
      retiredCount: 5,
    });
    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();
    expect(json.data).toMatchObject({
      published: true,
      promotedCount: 3,
      retiredCount: 5,
    });
    expect(json.data.publishedAt).toBe('2026-05-15T12:00:00.000Z');
  });

  it('carries the PAGE counts through to the wire, not just the section counts', async () => {
    /*
     * The seam nothing covered. The counts are pinned at the service (a
     * db-backed integration case) and at the component (a mocked result), and
     * neither can see this route dropping or renaming them in between.
     *
     * It matters more here than for most fields because the contract's response
     * is `z.unknown()` — deliberately, since `publishedAt` round-trips
     * Date → string and a tight schema would fail on the pre-serialization
     * safeParse. So nothing validates this shape at runtime, and both counts
     * are OPTIONAL on `PublishSiteResult` (a browser tab can be older or newer
     * than the server mid-deploy). A typo in the field name would therefore
     * degrade silently and permanently to "Published — your changes are live."
     * — the deploy-skew fallback, firing for a bug instead.
     *
     * REVERT CHECK — and the first version of this comment got it wrong twice,
     * which is worth recording because it is the mistake this suite keeps
     * making. It named `addedPageCount`/`removedPageCount` in
     * `publishCommunitySite`'s return: unreachable, because the service is
     * `vi.mock`ed at the top of this file, so those fields are pinned by the
     * db-backed integration case and by nothing here. It also named
     * `return result;` in the route: real, but shared — that line is a
     * whole-object passthrough already pinned by the two "verbatim" cases
     * below, so removing it reddens them identically and says nothing about
     * this one.
     *
     * The check that reddens THIS case and only this case is a MUTATION, not a
     * removal — verified by running it:
     *
     *     const { addedPageCount: _a, removedPageCount: _r, ...rest } =
     *       result as Record<string, unknown>;
     *     return rest;
     *
     * → 1 failed, 19 passed. No other fixture in this file carries the page
     * counts, so no other case notices. (A whole-hog field-picking rewrite
     * reddens the `nothing-to-publish` case too, because that fixture's
     * `reason` goes with it — which is a fact about that case, not this one.)
     *
     * `toEqual` rather than `toMatchObject` because the interesting failure is
     * a field going MISSING, and `toMatchObject` passes on a subset.
     */
    publishMock.mockResolvedValueOnce({
      published: true,
      publishedAt: new Date('2026-05-15T12:00:00.000Z'),
      promotedCount: 0,
      retiredCount: 0,
      addedPageCount: 0,
      removedPageCount: 1,
    });
    const res = await POST(makeRequest(VALID_BODY));
    const json = await res.json();
    expect(json.data).toEqual({
      published: true,
      publishedAt: '2026-05-15T12:00:00.000Z',
      promotedCount: 0,
      retiredCount: 0,
      addedPageCount: 0,
      removedPageCount: 1,
    });
  });

  it('returns the nothing-to-publish result body verbatim', async () => {
    publishMock.mockResolvedValueOnce({
      published: false,
      reason: 'nothing-to-publish',
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toEqual({ published: false, reason: 'nothing-to-publish' });
  });

  it('does NOT mark onboarding complete when the flag is absent (editor publish)', async () => {
    publishMock.mockResolvedValueOnce({
      published: true,
      publishedAt: new Date('2026-05-15T12:00:00.000Z'),
      promotedCount: 2,
      retiredCount: 1,
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(markOnboardingCompleteMock).not.toHaveBeenCalled();
  });

  it('marks onboarding complete when markOnboardingComplete=true (wizard publish)', async () => {
    publishMock.mockResolvedValueOnce({
      published: true,
      publishedAt: new Date('2026-05-15T12:00:00.000Z'),
      promotedCount: 4,
      retiredCount: 0,
    });
    const res = await POST(
      makeRequest({ ...VALID_BODY, markOnboardingComplete: true }),
    );
    expect(res.status).toBe(200);
    expect(markOnboardingCompleteMock).toHaveBeenCalledTimes(1);
    expect(markOnboardingCompleteMock).toHaveBeenCalledWith(42);
  });

  it('marks onboarding complete even when the publish was a no-op (wizard finished with no draft changes)', async () => {
    publishMock.mockResolvedValueOnce({
      published: false,
      reason: 'nothing-to-publish',
    });
    const res = await POST(
      makeRequest({ ...VALID_BODY, markOnboardingComplete: true }),
    );
    expect(res.status).toBe(200);
    expect(markOnboardingCompleteMock).toHaveBeenCalledTimes(1);
    expect(markOnboardingCompleteMock).toHaveBeenCalledWith(42);
  });

  it('does NOT mark onboarding complete when the publish errors (409 conflict)', async () => {
    publishMock.mockRejectedValueOnce(
      new ConflictError('Another editor published changes while you were working.'),
    );
    const res = await POST(
      makeRequest({ ...VALID_BODY, markOnboardingComplete: true }),
    );
    expect(res.status).toBe(409);
    expect(markOnboardingCompleteMock).not.toHaveBeenCalled();
  });

  it('400s when markOnboardingComplete is not a boolean', async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, markOnboardingComplete: 'yes' }),
    );
    expect(res.status).toBe(400);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('409s when the service throws ConflictError (optimistic-concurrency mismatch)', async () => {
    publishMock.mockRejectedValueOnce(
      new ConflictError('Another editor published changes while you were working.'),
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error?.message).toMatch(/another editor published/i);
  });

  it('400s when communityId is missing', async () => {
    const { communityId: _ignored, ...body } = VALID_BODY;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('400s when communityId is not a positive integer', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, communityId: -1 }));
    expect(res.status).toBe(400);
  });

  it('400s when expectedPublishedAt is not ISO 8601', async () => {
    const res = await POST(
      makeRequest({ ...VALID_BODY, expectedPublishedAt: 'last tuesday' }),
    );
    expect(res.status).toBe(400);
  });

  it('400s when expectedPublishedAt is missing entirely', async () => {
    const { expectedPublishedAt: _ignored, ...body } = VALID_BODY;
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
  });

  it('401s when unauthenticated (withErrorHandler maps to 401)', async () => {
    requireAuthMock.mockRejectedValueOnce(
      new AppError('Unauthorized', 401, 'UNAUTHORIZED'),
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it('403s when caller does not hold pm_admin or cam role', async () => {
    requireMembershipMock.mockResolvedValueOnce({ role: 'owner', communityId: 42 });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect(publishMock).not.toHaveBeenCalled();
  });

  it('allows CAM managers to publish', async () => {
    requireMembershipMock.mockResolvedValueOnce({
      role: 'property_manager',
      communityId: 42,
    });
    publishMock.mockResolvedValueOnce({
      published: true,
      publishedAt: new Date(),
      promotedCount: 1,
      retiredCount: 0,
    });
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(200);
    expect(publishMock).toHaveBeenCalled();
  });

  it('403s when plan does not include hasSiteEditor', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(
      new AppError('This feature requires a higher plan.', 403, 'PLAN_UPGRADE_REQUIRED'),
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
  });

  it('403s when caller is not a member of the community', async () => {
    requireMembershipMock.mockRejectedValueOnce(
      new AppError('Not a member', 403, 'FORBIDDEN'),
    );
    const res = await POST(makeRequest(VALID_BODY));
    expect(res.status).toBe(403);
    expect(publishMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/pm/site/publish — resident notification (launch blocker #6)', () => {
  const PUBLISHED = {
    published: true as const,
    publishedAt: new Date('2026-05-15T12:00:00.000Z'),
    promotedCount: 2,
    retiredCount: 0,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'property_manager', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_req: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    markOnboardingCompleteMock.mockResolvedValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    notifyResidentsMock.mockResolvedValue({
      status: 'sent',
      announcementId: 7,
      recipientCount: 12,
    });
  });

  it('does NOT notify residents when the publish did not ask for it', async () => {
    publishMock.mockResolvedValueOnce(PUBLISHED);

    const res = await POST(makeRequest(VALID_BODY));

    expect(res.status).toBe(200);
    expect(notifyResidentsMock).not.toHaveBeenCalled();
    // And the body is unchanged from a pre-feature publish: absent, never
    // `{ status: 'skipped' }`, so no consumer can mistake a quiet publish for
    // a delivered one.
    const json = await res.json();
    expect(json.data.residentNotification).toBeUndefined();
  });

  it('forwards the summary and the resolved community to the notifier', async () => {
    publishMock.mockResolvedValueOnce(PUBLISHED);

    const res = await POST(
      makeRequest({ ...VALID_BODY, notifyResidents: { summary: 'Pool hours updated' } }),
    );

    expect(res.status).toBe(200);
    expect(notifyResidentsMock).toHaveBeenCalledTimes(1);
    expect(notifyResidentsMock).toHaveBeenCalledWith({
      communityId: 42,
      actorUserId: 'user-1',
      summary: 'Pool hours updated',
    });
  });

  it('puts the notification outcome on the wire beside the publish result', async () => {
    publishMock.mockResolvedValueOnce(PUBLISHED);

    const res = await POST(
      makeRequest({ ...VALID_BODY, notifyResidents: { summary: 'Pool hours updated' } }),
    );

    const json = await res.json();
    expect(json.data).toMatchObject({
      published: true,
      promotedCount: 2,
      residentNotification: { status: 'sent', announcementId: 7, recipientCount: 12 },
    });
  });

  it('still 200s — and reports the failure — when delivery fails', async () => {
    /*
     * The whole point of the feature's failure design. `publishCommunitySite`
     * has already COMMITTED by the time the notifier runs, so a delivery
     * failure cannot be turned into an error response without telling the PM
     * their publish failed when their site is, in fact, live.
     *
     * It must equally not be swallowed: a silent drop hands back an ordinary
     * success and the PM believes their residents were told.
     */
    publishMock.mockResolvedValueOnce(PUBLISHED);
    notifyResidentsMock.mockResolvedValueOnce({
      status: 'failed',
      reason: 'smtp exploded',
    });

    const res = await POST(
      makeRequest({ ...VALID_BODY, notifyResidents: { summary: 'Pool hours updated' } }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.published).toBe(true);
    expect(json.data.residentNotification).toEqual({
      status: 'failed',
      reason: 'smtp exploded',
    });
  });

  it('does NOT notify when there was nothing to publish', async () => {
    /*
     * `nothing-to-publish` rolls the transaction back. Notifying there would
     * mail an entire association to announce a no-op.
     */
    publishMock.mockResolvedValueOnce({ published: false, reason: 'nothing-to-publish' });

    const res = await POST(
      makeRequest({ ...VALID_BODY, notifyResidents: { summary: 'Pool hours updated' } }),
    );

    expect(res.status).toBe(200);
    expect(notifyResidentsMock).not.toHaveBeenCalled();
    expect(await res.json()).toMatchObject({
      data: { published: false, reason: 'nothing-to-publish' },
    });
  });

  it('requires announcements:write before broadcasting, and refuses BEFORE publishing', async () => {
    /*
     * Publishing the site and mailing every resident are different authorities.
     * The gate runs before `publishCommunitySite` on purpose: a caller who may
     * publish but may not announce should be refused outright, not have the
     * site go live and the notification quietly dropped afterwards — which is
     * the shape the whole launch-blocker list is about.
     */
    requirePermissionMock.mockImplementation(() => {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    });

    const res = await POST(
      makeRequest({ ...VALID_BODY, notifyResidents: { summary: 'Pool hours updated' } }),
    );

    expect(res.status).toBe(403);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'property_manager' }),
      'announcements',
      'write',
    );
    expect(publishMock).not.toHaveBeenCalled();
    expect(notifyResidentsMock).not.toHaveBeenCalled();
  });

  it('does NOT consult announcements:write for a quiet publish', async () => {
    publishMock.mockResolvedValueOnce(PUBLISHED);

    await POST(makeRequest(VALID_BODY));

    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it('400s on a whitespace-only summary rather than broadcasting a blank notice', async () => {
    publishMock.mockResolvedValueOnce(PUBLISHED);

    const res = await POST(
      makeRequest({ ...VALID_BODY, notifyResidents: { summary: '   ' } }),
    );

    expect(res.status).toBe(400);
    expect(publishMock).not.toHaveBeenCalled();
    expect(notifyResidentsMock).not.toHaveBeenCalled();
  });

  it('400s on a summary past the length limit', async () => {
    publishMock.mockResolvedValueOnce(PUBLISHED);

    const res = await POST(
      makeRequest({
        ...VALID_BODY,
        notifyResidents: { summary: 'x'.repeat(SITE_PUBLISH_SUMMARY_MAX_LENGTH + 1) },
      }),
    );

    expect(res.status).toBe(400);
    expect(notifyResidentsMock).not.toHaveBeenCalled();
  });
});
