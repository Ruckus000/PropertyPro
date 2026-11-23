/**
 * Route unit tests — `POST /api/v1/emergency-broadcasts/[id]/schedule`.
 *
 * The route converts a drafted alert into a scheduled one. The service is
 * mocked here, so the two window bounds are exercised as the service's own
 * `ValidationError` passing through the route to a 400 naming the field; that
 * the service raises them at 5 minutes and 365 days, before any write, is
 * pinned in `emergency/emergency-broadcast-scheduling.test.ts`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ConflictError, NotFoundError, ValidationError } from '../../src/lib/api/errors';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  scheduleBroadcastMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  scheduleBroadcastMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));
vi.mock('@/lib/db/access-control', () => ({ requirePermission: requirePermissionMock }));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: assertNotDemoGraceMock }));
vi.mock('@/lib/services/emergency-broadcast-service', () => ({
  scheduleBroadcast: scheduleBroadcastMock,
}));

import { POST } from '../../src/app/api/v1/emergency-broadcasts/[id]/schedule/route';

const MEMBERSHIP = {
  userId: 'user-admin-1',
  communityId: 42,
  role: 'property_manager' as const,
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718' as const,
};
const WHEN = '2026-12-01T14:00:00.000Z';

function jsonPost(id: string | number, payload: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/emergency-broadcasts/${id}/schedule`, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const send = (payload: unknown = { communityId: 42, scheduledFor: WHEN }, id = '99') =>
  POST(jsonPost(id, payload), ctx(id));

type ErrorBody = { error: { code: string; message: string; details?: { fields?: Array<{ field: string }> } } };

describe('POST /api/v1/emergency-broadcasts/[id]/schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    scheduleBroadcastMock.mockResolvedValue({ scheduled: true, scheduledFor: WHEN });
  });

  it('schedules the draft and returns {data: {scheduled: true, scheduledFor}}', async () => {
    const res = await send();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { scheduled: true, scheduledFor: WHEN } });
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), 42);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin-1');
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'emergency_broadcasts', 'write');
    // scheduleBroadcast(broadcastId, communityId, userId, scheduledFor) — id FIRST, time as a Date.
    expect(scheduleBroadcastMock).toHaveBeenCalledTimes(1);
    expect(scheduleBroadcastMock).toHaveBeenCalledWith(99, 42, 'user-admin-1', new Date(WHEN));
  });

  it('accepts a time written with an offset, as the same instant', async () => {
    await send({ communityId: 42, scheduledFor: '2026-12-01T09:00:00-05:00' });
    expect(scheduleBroadcastMock.mock.calls[0]![3]).toEqual(new Date(WHEN));
  });

  it('uses the community the resolver returns, not the body value', async () => {
    resolveEffectiveCommunityIdMock.mockReturnValue(7);
    await send();
    expect(scheduleBroadcastMock).toHaveBeenCalledWith(99, 7, 'user-admin-1', new Date(WHEN));
  });

  it('401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const res = await send();
    expect(res.status).toBe(401);
    expect(scheduleBroadcastMock).not.toHaveBeenCalled();
  });

  it('404 when the x-community-id header disagrees with the body communityId', async () => {
    resolveEffectiveCommunityIdMock.mockImplementationOnce(() => {
      throw new NotFoundError('Community not found');
    });
    const res = await POST(
      jsonPost(99, { communityId: 42, scheduledFor: WHEN }, { 'x-community-id': '7' }),
      ctx('99'),
    );
    expect(res.status).toBe(404);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(scheduleBroadcastMock).not.toHaveBeenCalled();
  });

  it('403 during the demo grace window, BEFORE membership and permission are checked', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));
    const res = await send();
    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(scheduleBroadcastMock).not.toHaveBeenCalled();
  });

  it('403 when the caller is not a member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));
    const res = await send();
    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(scheduleBroadcastMock).not.toHaveBeenCalled();
  });

  it('403 when emergency_broadcasts write is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });
    const res = await send();
    expect(res.status).toBe(403);
    expect(scheduleBroadcastMock).not.toHaveBeenCalled();
  });

  it.each([
    ['missing scheduledFor', { communityId: 42 }],
    ['missing communityId', { scheduledFor: WHEN }],
    ['a time with no offset', { communityId: 42, scheduledFor: '2026-12-01T14:00:00' }],
    ['a date with no time', { communityId: 42, scheduledFor: '2026-12-01' }],
    ['a non-string time', { communityId: 42, scheduledFor: 1796133600000 }],
    ['a non-positive communityId', { communityId: 0, scheduledFor: WHEN }],
  ])('400 VALIDATION_ERROR for %s, before auth runs', async (_label, payload) => {
    const res = await send(payload);
    expect(res.status).toBe(400);
    expect(((await res.json()) as ErrorBody).error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(scheduleBroadcastMock).not.toHaveBeenCalled();
  });

  it.each(['abc', '0', '-1', '1.5'])('400 VALIDATION_ERROR when the id is %j', async (id) => {
    const res = await send({ communityId: 42, scheduledFor: WHEN }, id);
    expect(res.status).toBe(400);
    expect(scheduleBroadcastMock).not.toHaveBeenCalled();
  });

  it.each([
    ['less than 5 minutes ahead', 'Choose a time at least 5 minutes from now.', 'Must be at least 5 minutes from now.'],
    ['more than 365 days ahead', 'Choose a time within the next 365 days.', 'Must be within the next 365 days.'],
  ])('400 naming the scheduledFor field when the time is %s', async (_label, message, fieldMessage) => {
    scheduleBroadcastMock.mockRejectedValueOnce(
      new ValidationError(message, { fields: [{ field: 'scheduledFor', message: fieldMessage }] }),
    );
    const res = await send();
    expect(res.status).toBe(400);
    const json = (await res.json()) as ErrorBody;
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.message).toBe(message);
    expect(json.error.details?.fields?.[0]?.field).toBe('scheduledFor');
  });

  it('409 CONFLICT when the draft was already sent, scheduled or canceled', async () => {
    scheduleBroadcastMock.mockRejectedValueOnce(
      new ConflictError('This alert has already been sent, scheduled or canceled.'),
    );
    const res = await send();
    expect(res.status).toBe(409);
    expect(((await res.json()) as ErrorBody).error).toMatchObject({
      code: 'CONFLICT',
      message: 'This alert has already been sent, scheduled or canceled.',
    });
  });
});
