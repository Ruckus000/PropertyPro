/**
 * The scheduled-publish endpoints (launch blocker #7).
 *
 * The bounds live in the handler rather than the contract's Zod schema because
 * both are relative to the request instant, which a static schema cannot
 * express — so they need covering here rather than being assumed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { AppError } from '@/lib/api/errors';

const {
  requireAuthMock,
  requireMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePlanFeatureMock,
  requirePermissionMock,
  scheduleMock,
  cancelMock,
  getPendingMock,
} = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  requireMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePlanFeatureMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  scheduleMock: vi.fn(),
  cancelMock: vi.fn(),
  getPendingMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthMock }));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireMembershipMock,
}));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));
vi.mock('@/lib/middleware/plan-guard', () => ({ requirePlanFeature: requirePlanFeatureMock }));
vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
  checkPermissionV2: vi.fn(() => true),
}));
vi.mock('@/lib/services/site-publish-schedule-service', async () => {
  // Only the data functions are stubbed. MAX_SCHEDULE_DAYS_AHEAD and
  // maxScheduleDate are pure and are the thing under test, so they stay real —
  // stubbing them would make the bounds cases assert against the mock.
  const actual = await vi.importActual<
    typeof import('@/lib/services/site-publish-schedule-service')
  >('@/lib/services/site-publish-schedule-service');
  return {
    ...actual,
    scheduleSitePublish: scheduleMock,
    cancelSitePublishSchedule: cancelMock,
    getSitePublishScheduleForEditor: getPendingMock,
  };
});

import { GET, POST, DELETE } from '@/app/api/v1/pm/site/publish/schedule/route';

function post(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/v1/pm/site/publish/schedule', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}
function get(qs = '?communityId=42'): NextRequest {
  return new NextRequest(`http://localhost/api/v1/pm/site/publish/schedule${qs}`);
}
function del(qs = '?communityId=42'): NextRequest {
  return new NextRequest(`http://localhost/api/v1/pm/site/publish/schedule${qs}`, {
    method: 'DELETE',
  });
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

describe('/api/v1/pm/site/publish/schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'property_manager', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_r: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    requirePermissionMock.mockReturnValue(undefined);
    getPendingMock.mockResolvedValue(null);
    cancelMock.mockResolvedValue(true);
    scheduleMock.mockImplementation(async ({ scheduledFor }: { scheduledFor: Date }) => ({
      id: 1,
      status: 'pending' as const,
      scheduledFor: scheduledFor.toISOString(),
      notifySummary: null,
      errorMessage: null,
    }));
  });

  it('schedules a publish and returns the stored schedule', async () => {
    const when = daysFromNow(7);
    const res = await POST(post({ communityId: 42, scheduledFor: when }));

    expect(res.status).toBe(200);
    expect(scheduleMock).toHaveBeenCalledWith({
      communityId: 42,
      actorUserId: 'user-1',
      scheduledFor: new Date(when),
      notifySummary: null,
    });
    expect((await res.json()).data.schedule.scheduledFor).toBe(when);
  });

  it('400s on a time that has already passed', async () => {
    const res = await POST(post({ communityId: 42, scheduledFor: daysFromNow(-1) }));

    expect(res.status).toBe(400);
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('400s beyond the 90-day horizon', async () => {
    /*
     * The bound is not arbitrary: a pending schedule holds staged drafts
     * hostage, and a year-out schedule everyone has forgotten is a trap.
     */
    const res = await POST(post({ communityId: 42, scheduledFor: daysFromNow(120) }));

    expect(res.status).toBe(400);
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('accepts a time just inside the horizon', async () => {
    // The control for the case above — without it, a handler that rejected
    // everything would look identical.
    const res = await POST(post({ communityId: 42, scheduledFor: daysFromNow(89) }));

    expect(res.status).toBe(200);
    expect(scheduleMock).toHaveBeenCalled();
  });

  it('carries the notification opt-in through, gated on announcements:write', async () => {
    const res = await POST(
      post({
        communityId: 42,
        scheduledFor: daysFromNow(7),
        notifyResidents: { summary: 'Pool hours updated' },
      }),
    );

    expect(res.status).toBe(200);
    expect(requirePermissionMock).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'property_manager' }),
      'announcements',
      'write',
    );
    expect(scheduleMock.mock.calls[0]![0].notifySummary).toBe('Pool hours updated');
  });

  it('refuses to schedule a broadcast without announcements:write', async () => {
    requirePermissionMock.mockImplementation(() => {
      throw new AppError('Forbidden', 403, 'FORBIDDEN');
    });

    const res = await POST(
      post({
        communityId: 42,
        scheduledFor: daysFromNow(7),
        notifyResidents: { summary: 'Pool hours updated' },
      }),
    );

    expect(res.status).toBe(403);
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('does not consult announcements:write for a quiet schedule', async () => {
    await POST(post({ communityId: 42, scheduledFor: daysFromNow(7) }));
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it('requires a PM manager role and the site-editor plan feature', async () => {
    requirePlanFeatureMock.mockRejectedValueOnce(new AppError('Upgrade required', 403, 'FORBIDDEN'));

    const res = await POST(post({ communityId: 42, scheduledFor: daysFromNow(7) }));

    expect(res.status).toBe(403);
    expect(scheduleMock).not.toHaveBeenCalled();
  });

  it('returns null when nothing is scheduled', async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect((await res.json()).data.schedule).toBeNull();
  });

  it('cancels the pending schedule', async () => {
    const res = await DELETE(del());
    expect(res.status).toBe(200);
    expect((await res.json()).data.canceled).toBe(true);
    expect(cancelMock).toHaveBeenCalledWith(42, 'user-1');
  });

  it('reports canceled=false when there was nothing to cancel', async () => {
    cancelMock.mockResolvedValueOnce(false);
    const res = await DELETE(del());
    expect((await res.json()).data.canceled).toBe(false);
  });
});

describe('GET /api/v1/pm/site/publish/schedule — reporting a failure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue('user-1');
    requireMembershipMock.mockResolvedValue({ role: 'property_manager', communityId: 42 });
    resolveEffectiveCommunityIdMock.mockImplementation((_r: unknown, id: number) => id);
    requirePlanFeatureMock.mockResolvedValue(undefined);
  });

  it('reports a failed schedule and its reason, not an empty result', async () => {
    /*
     * A schedule that ran out of attempts must not simply vanish — an absent
     * row is indistinguishable from "never scheduled", which is exactly the
     * silence this feature exists to remove.
     */
    getPendingMock.mockResolvedValue({
      id: 4,
      status: 'failed',
      scheduledFor: '2026-08-01T15:00:00.000Z',
      notifySummary: null,
      errorMessage: 'Nothing was published.',
    });

    const res = await GET(get());

    expect(res.status).toBe(200);
    expect((await res.json()).data.schedule).toMatchObject({
      status: 'failed',
      errorMessage: 'Nothing was published.',
    });
  });

  it('passes a running schedule through so the sheet can say so', async () => {
    getPendingMock.mockResolvedValue({
      id: 5,
      status: 'running',
      scheduledFor: '2026-08-01T15:00:00.000Z',
      notifySummary: null,
      errorMessage: null,
    });

    const res = await GET(get());

    expect((await res.json()).data.schedule.status).toBe('running');
  });
});
