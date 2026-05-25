/**
 * Route unit tests — `GET /api/v1/calendar/events`.
 *
 * Added alongside Plan A1 bundle drain #35. Query-only GET; covers the
 * runner envelope + a happy-path where the membership permission check
 * succeeds. The detailed event-shape assertions live in the existing
 * `phase2a` integration test. This file's job is the auth-chain
 * rejection paths + the runner validation envelope.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  checkPermissionV2Mock,
  listCommunityCalendarMeetingsMock,
  listAggregateAssessmentDueRecordsMock,
  listOwnerAssessmentDueRecordsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  checkPermissionV2Mock: vi.fn(),
  listCommunityCalendarMeetingsMock: vi.fn(),
  listAggregateAssessmentDueRecordsMock: vi.fn(),
  listOwnerAssessmentDueRecordsMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
  checkPermissionV2: checkPermissionV2Mock,
}));
vi.mock('@/lib/services/calendar-data-service', () => ({
  listCommunityCalendarMeetings: listCommunityCalendarMeetingsMock,
  listAggregateAssessmentDueRecords: listAggregateAssessmentDueRecordsMock,
  listOwnerAssessmentDueRecords: listOwnerAssessmentDueRecordsMock,
}));

import { GET } from '../../src/app/api/v1/calendar/events/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-1',
  communityId: 42,
  role: 'board_member' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board Member',
  communityType: 'condo_718' as const,
  timezone: 'America/New_York',
};

function req(qs: string, headers?: Record<string, string>): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/calendar/events${qs}`, {
    headers: headers ?? {},
  });
}

describe('GET /api/v1/calendar/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    checkPermissionV2Mock.mockReturnValue(false);
    listCommunityCalendarMeetingsMock.mockResolvedValue([]);
  });

  it('returns a wrapped empty array for an admin with no events', async () => {
    const res = await GET(req('?communityId=42&start=2026-04-01&end=2026-04-30'));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown[] };
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data).toEqual([]);
    expect(requirePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP, 'meetings', 'read');
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());
    const res = await GET(req('?communityId=42&start=2026-04-01&end=2026-04-30'));
    expect(res.status).toBe(401);
  });

  it('returns 400 when communityId is non-numeric', async () => {
    const res = await GET(req('?communityId=abc&start=2026-04-01&end=2026-04-30'));
    expect(res.status).toBe(400);
  });

  it('returns 400 when start or end is missing', async () => {
    const res = await GET(req('?communityId=42'));
    expect(res.status).toBe(400);
  });

  it('returns 404 when x-community-id header disagrees with the query', async () => {
    const res = await GET(
      req('?communityId=42&start=2026-04-01&end=2026-04-30', { 'x-community-id': '99' }),
    );
    expect(res.status).toBe(404);
  });

  it('returns 403 when user is not a member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member'),
    );
    const res = await GET(req('?communityId=42&start=2026-04-01&end=2026-04-30'));
    expect(res.status).toBe(403);
  });

  it('returns 403 when meetings.read is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('No meetings.read');
    });
    const res = await GET(req('?communityId=42&start=2026-04-01&end=2026-04-30'));
    expect(res.status).toBe(403);
  });

  it('falls back to x-community-id header when query communityId is absent', async () => {
    const res = await GET(
      req('?start=2026-04-01&end=2026-04-30', { 'x-community-id': '42' }),
    );
    expect(res.status).toBe(200);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
  });
});
