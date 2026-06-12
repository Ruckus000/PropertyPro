/**
 * TDD gate test — board-meeting creation requires a board designation.
 *
 * Three cases:
 *   1. board meeting + designated/management caller → 200 (seam fires, no throw)
 *   2. board meeting + caller without board rights → 403 (seam fires, throws)
 *   3. non-board meeting → 200 (seam NOT fired at all)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

// ---------------------------------------------------------------------------
// Hoisted mocks — must be declared before any import of the route module
// ---------------------------------------------------------------------------
const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  requireBoardDesignationMock,
  requireActiveSubscriptionForMutationMock,
  assertNotDemoGraceMock,
  createMeetingForCommunityMock,
  getMeetingDetailMock,
  getMeetingCommunityTimezoneMock,
  updateMeetingForCommunityMock,
  softDeleteMeetingForCommunityMock,
  attachMeetingDocumentMock,
  detachMeetingDocumentMock,
  getMeetingDocumentTargetsMock,
  listMeetingsForCommunityMock,
  serializeMeetingResponseMock,
  createNotificationsForEventMock,
  queueNotificationMock,
  logAuditEventMock,
  parseCommunityIdFromQueryMock,
  parseCommunityIdFromBodyMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  requireBoardDesignationMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  createMeetingForCommunityMock: vi.fn(),
  getMeetingDetailMock: vi.fn(),
  getMeetingCommunityTimezoneMock: vi.fn(),
  updateMeetingForCommunityMock: vi.fn(),
  softDeleteMeetingForCommunityMock: vi.fn(),
  attachMeetingDocumentMock: vi.fn(),
  detachMeetingDocumentMock: vi.fn(),
  getMeetingDocumentTargetsMock: vi.fn(),
  listMeetingsForCommunityMock: vi.fn(),
  serializeMeetingResponseMock: vi.fn(),
  createNotificationsForEventMock: vi.fn(),
  queueNotificationMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
  requireBoardDesignation: requireBoardDesignationMock,
}));
vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));
vi.mock('@/lib/services/meeting-service', () => ({
  createMeetingForCommunity: createMeetingForCommunityMock,
  getMeetingDetail: getMeetingDetailMock,
  getMeetingCommunityTimezone: getMeetingCommunityTimezoneMock,
  updateMeetingForCommunity: updateMeetingForCommunityMock,
  softDeleteMeetingForCommunity: softDeleteMeetingForCommunityMock,
  attachMeetingDocument: attachMeetingDocumentMock,
  detachMeetingDocument: detachMeetingDocumentMock,
  getMeetingDocumentTargets: getMeetingDocumentTargetsMock,
  listMeetingsForCommunity: listMeetingsForCommunityMock,
}));
vi.mock('@/lib/services/notification-service', () => ({
  createNotificationsForEvent: createNotificationsForEventMock,
  queueNotification: queueNotificationMock,
}));
vi.mock('@/lib/meetings/meeting-response', () => ({
  serializeMeetingResponse: serializeMeetingResponseMock,
}));
vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
}));
vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
}));
// resolveTimezone is a pure utility — let it run real (no DB access)

// ---------------------------------------------------------------------------
// Import route after all mocks are in place
// ---------------------------------------------------------------------------
import { POST } from '../../src/app/api/v1/meetings/route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const COMMUNITY_ID = 42;

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: COMMUNITY_ID,
  role: 'manager' as const,
  isAdmin: true,
  isUnitOwner: false,
  designation: 'board_president',
  displayTitle: 'Manager',
  communityType: 'condo_718' as const,
  timezone: 'America/New_York',
};

const CREATED_MEETING = {
  id: 99,
  title: 'Board Test',
  meetingType: 'board',
  startsAt: new Date('2026-07-01T17:00:00-04:00'),
  endsAt: null,
  location: 'Clubhouse',
  communityId: COMMUNITY_ID,
};

function boardMeetingReq(): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/meetings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-community-id': String(COMMUNITY_ID),
    },
    body: JSON.stringify({
      communityId: COMMUNITY_ID,
      title: 'Board Test',
      meetingType: 'board',
      startsAt: '2026-07-01T17:00:00-04:00',
      location: 'Clubhouse',
    }),
  });
}

function annualMeetingReq(): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/meetings', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-community-id': String(COMMUNITY_ID),
    },
    body: JSON.stringify({
      communityId: COMMUNITY_ID,
      title: 'Annual Meeting',
      meetingType: 'annual',
      startsAt: '2026-07-01T17:00:00-04:00',
      location: 'Clubhouse',
    }),
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('POST /api/v1/meetings — board-designation gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Auth / membership
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);

    // Permission guards — default to no-op (allowed)
    requirePermissionMock.mockReturnValue(undefined);
    requireBoardDesignationMock.mockReturnValue(undefined);

    // Guard middleware — default to no-op
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);

    // finance/request — parseCommunityIdFromBody validates against the header;
    // stub it to return the community id directly so we don't need a real req
    parseCommunityIdFromBodyMock.mockReturnValue(COMMUNITY_ID);

    // Meeting service
    createMeetingForCommunityMock.mockResolvedValue(CREATED_MEETING.id);
    getMeetingDetailMock.mockResolvedValue(CREATED_MEETING);
    getMeetingCommunityTimezoneMock.mockResolvedValue('America/New_York');

    // Notifications — should not throw
    queueNotificationMock.mockResolvedValue(undefined);
    createNotificationsForEventMock.mockResolvedValue(undefined);

    // Audit log
    logAuditEventMock.mockResolvedValue(undefined);

    // Serialize — return a minimal meeting shape
    serializeMeetingResponseMock.mockReturnValue({
      id: CREATED_MEETING.id,
      title: CREATED_MEETING.title,
      meetingType: CREATED_MEETING.meetingType,
    });
  });

  it('allows a board meeting for a management-tier caller (seam fires, does not throw)', async () => {
    requireBoardDesignationMock.mockImplementation(() => {});

    const res = await POST(boardMeetingReq());

    expect(res.status).toBe(200);
    // The seam must have been invoked for meetingType:'board'
    expect(requireBoardDesignationMock).toHaveBeenCalled();
  });

  it('rejects a board meeting when requireBoardDesignation throws (403)', async () => {
    requireBoardDesignationMock.mockImplementation(() => {
      throw new ForbiddenError('no board designation');
    });

    const res = await POST(boardMeetingReq());

    expect(res.status).toBe(403);
  });

  it('does not require board designation for a non-board meeting', async () => {
    // Even if requireBoardDesignation would throw, it must NOT be called for 'annual'
    requireBoardDesignationMock.mockImplementation(() => {
      throw new ForbiddenError('should not be called');
    });

    const res = await POST(annualMeetingReq());

    expect(res.status).toBe(200);
    expect(requireBoardDesignationMock).not.toHaveBeenCalled();
  });

  it('requires board designation when updating a meeting to type board', async () => {
    requireBoardDesignationMock.mockImplementation(() => {
      throw new ForbiddenError('no board designation');
    });

    const req = new NextRequest('http://localhost:3000/api/v1/meetings', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-community-id': String(COMMUNITY_ID),
      },
      body: JSON.stringify({
        action: 'update',
        id: 99,
        communityId: COMMUNITY_ID,
        meetingType: 'board',
      }),
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(requireBoardDesignationMock).toHaveBeenCalled();
  });
});
