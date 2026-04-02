/**
 * Unit tests for maintenance requests [id] API route (P3-50/P3-51).
 *
 * Tests cover:
 * GET:
 * - Admin can GET any request (returns internalNotes)
 * - Resident can GET own request (internalNotes stripped)
 * - Resident cannot GET another user's request (403)
 * - Request not found (404)
 * - Missing communityId (400)
 * - Invalid id (400)
 * - Legacy status normalization: open → submitted, normal → medium
 *
 * PATCH:
 * - Admin can update status with valid transition (200, audit logged)
 * - Invalid status transition (422 with allowedTransitions)
 * - Resident cannot PATCH (403)
 * - Request not found (404)
 * - No fields to update (400)
 * - assignedToId validation: assignee must be community admin (400)
 * - Status change queues notification (no internalNotes in payload)
 * - internalNotes update (audit log includes old/new)
 * - Legacy 'open' status rows can transition to 'acknowledged'
 *
 * DELETE:
 * - Admin can soft-delete (200, audit logged)
 * - Resident cannot DELETE (403)
 * - Request not found (404)
 * - Missing communityId (400)
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  createScopedClientMock,
  logAuditEventMock,
  maintenanceRequestsTableMock,
  maintenanceCommentsTableMock,
  userRolesTableMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  assertNotDemoGraceMock,
  requirePlanFeatureMock,
  queueNotificationMock,
  createNotificationsForEventMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  maintenanceRequestsTableMock: { id: Symbol('maintenance_requests.id') },
  maintenanceCommentsTableMock: { requestId: Symbol('maintenance_comments.requestId') },
  userRolesTableMock: { userId: Symbol('user_roles.userId') },
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn().mockResolvedValue(undefined),
  requirePlanFeatureMock: vi.fn().mockResolvedValue(undefined),
  queueNotificationMock: vi.fn().mockResolvedValue(undefined),
  createNotificationsForEventMock: vi.fn().mockResolvedValue({ created: 0 }),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  maintenanceRequests: maintenanceRequestsTableMock,
  maintenanceComments: maintenanceCommentsTableMock,
  userRoles: userRolesTableMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn().mockReturnValue('eq-filter'),
}));

vi.mock('@propertypro/shared', () => ({
  ADMIN_ROLES: ['board_member', 'board_president', 'cam', 'site_manager', 'property_manager_admin'],
  RESIDENT_ROLES: ['owner', 'tenant'],
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: requirePlanFeatureMock,
}));

vi.mock('@/lib/services/notification-service', () => ({
  queueNotification: queueNotificationMock,
  createNotificationsForEvent: createNotificationsForEventMock,
}));

import { GET, PATCH, DELETE } from '../../src/app/api/v1/maintenance-requests/[id]/route';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ADMIN_MEMBERSHIP = {
  userId: 'session-user-1',
  communityId: 42,
  role: 'board_president',
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  presetKey: 'board_president',
  communityType: 'condo_718',
  permissions: {
    resources: {
      documents: { read: true, write: true },
      meetings: { read: true, write: true },
      announcements: { read: true, write: true },
      compliance: { read: true, write: true },
      residents: { read: true, write: true },
      financial: { read: true, write: true },
      maintenance: { read: true, write: true },
      violations: { read: true, write: true },
      leases: { read: true, write: true },
      contracts: { read: true, write: true },
      polls: { read: true, write: true },
      settings: { read: true, write: true },
      audit: { read: true, write: true },
      arc_submissions: { read: true, write: true },
      work_orders: { read: true, write: true },
      amenities: { read: true, write: true },
      packages: { read: true, write: true },
      visitors: { read: true, write: true },
      calendar_sync: { read: true, write: true },
      accounting: { read: true, write: true },
      esign: { read: true, write: true },
      finances: { read: true, write: true },
    },
  },
};

const RESIDENT_MEMBERSHIP = {
  userId: 'session-user-1',
  communityId: 42,
  role: 'owner',
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Owner',
  presetKey: 'owner',
  communityType: 'condo_718',
  permissions: {
    resources: {
      maintenance: { read: true, write: false },
    },
  },
};

function makeMaintenanceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    communityId: 42,
    unitId: null,
    submittedById: 'session-user-1',
    title: 'Leaky faucet',
    description: 'Kitchen faucet drips constantly',
    status: 'submitted',
    priority: 'medium',
    category: 'plumbing',
    assignedToId: null,
    internalNotes: 'Check under sink first',
    resolutionDescription: null,
    resolutionDate: null,
    photos: null,
    createdAt: new Date('2026-01-15T10:00:00Z'),
    updatedAt: new Date('2026-01-15T10:00:00Z'),
    ...overrides,
  };
}

function makeCommentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    requestId: 1,
    userId: 'admin-user',
    text: 'Will schedule a plumber',
    isInternal: false,
    createdAt: new Date('2026-01-16T09:00:00Z'),
    ...overrides,
  };
}

/**
 * Builds a simple chainable builder that just resolves to `rows` when awaited.
 * Sufficient for the selectFrom() calls in this route.
 */
function makeChainableBuilder(rows: unknown[]) {
  const thenable = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve),
  };
  return thenable;
}

/**
 * Creates a default scoped client mock.
 * - selectFrom(maintenanceRequestsTableMock) → [maintenanceRow] by default
 * - selectFrom(maintenanceCommentsTableMock) → [commentRow] by default
 * - selectFrom(userRolesTableMock) → [] by default
 * - update → [updatedRow]
 * - softDelete → []
 */
function makeDefaultScopedClient(overrides: {
  requestRows?: unknown[];
  commentRows?: unknown[];
  userRoleRows?: unknown[];
  updatedRows?: unknown[];
} = {}) {
  const requestRows = overrides.requestRows ?? [makeMaintenanceRow()];
  const commentRows = overrides.commentRows ?? [makeCommentRow()];
  const userRoleRows = overrides.userRoleRows ?? [];
  const updatedRows = overrides.updatedRows ?? [makeMaintenanceRow({ status: 'acknowledged' })];

  const selectFrom = vi.fn().mockImplementation((table: unknown) => {
    if (table === maintenanceRequestsTableMock) {
      return makeChainableBuilder(requestRows);
    }
    if (table === maintenanceCommentsTableMock) {
      return makeChainableBuilder(commentRows);
    }
    if (table === userRolesTableMock) {
      return makeChainableBuilder(userRoleRows);
    }
    return makeChainableBuilder([]);
  });

  const update = vi.fn().mockResolvedValue(updatedRows);
  const softDelete = vi.fn().mockResolvedValue([]);

  return { selectFrom, update, softDelete };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

describe('maintenance requests [id] route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requirePlanFeatureMock.mockResolvedValue(undefined);
    queueNotificationMock.mockResolvedValue(undefined);
    logAuditEventMock.mockResolvedValue(undefined);
    createScopedClientMock.mockReturnValue(makeDefaultScopedClient());
  });

  // -------------------------------------------------------------------------
  // GET tests
  // -------------------------------------------------------------------------

  describe('GET', () => {
    it('admin can GET any request and receives internalNotes', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests/1?communityId=42');
      const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(200);
      const body = await res.json() as { data: Record<string, unknown> };
      expect(body.data).toBeDefined();
      expect(body.data['internalNotes']).toBe('Check under sink first');
    });

    it('resident can GET their own request and internalNotes is NOT in response', async () => {
      requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests/1?communityId=42');
      const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(200);
      const body = await res.json() as { data: Record<string, unknown> };
      expect(body.data).toBeDefined();
      expect('internalNotes' in body.data).toBe(false);
    });

    it('resident cannot GET another user\'s request — returns 403', async () => {
      requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
      // The request belongs to a different user
      createScopedClientMock.mockReturnValue(
        makeDefaultScopedClient({
          requestRows: [makeMaintenanceRow({ submittedById: 'other-user-999' })],
        }),
      );
      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests/1?communityId=42');
      const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(403);
    });

    it('returns 404 when request not found', async () => {
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ requestRows: [] }));
      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests/1?communityId=42');
      const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(404);
    });

    it('returns 400 when communityId is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests/1');
      const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(400);
    });

    it('returns 400 when id is non-integer', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests/abc?communityId=42');
      const res = await GET(req, { params: Promise.resolve({ id: 'abc' }) });
      expect(res.status).toBe(400);
    });

    it('normalizes legacy status open → submitted and priority normal → medium', async () => {
      createScopedClientMock.mockReturnValue(
        makeDefaultScopedClient({
          requestRows: [makeMaintenanceRow({ status: 'open', priority: 'normal' })],
        }),
      );
      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests/1?communityId=42');
      const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(200);
      const body = await res.json() as { data: Record<string, unknown> };
      expect(body.data['status']).toBe('submitted');
      expect(body.data['priority']).toBe('medium');
    });

    it('resident sees only non-internal comments', async () => {
      requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
      createScopedClientMock.mockReturnValue(
        makeDefaultScopedClient({
          commentRows: [
            makeCommentRow({ id: 1, isInternal: false, text: 'Public comment' }),
            makeCommentRow({ id: 2, isInternal: true, text: 'Internal note' }),
          ],
        }),
      );
      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests/1?communityId=42');
      const res = await GET(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(200);
      const body = await res.json() as { data: { comments: Array<Record<string, unknown>> } };
      expect(body.data.comments).toHaveLength(1);
      expect(body.data.comments[0]!['text']).toBe('Public comment');
    });
  });

  // -------------------------------------------------------------------------
  // PATCH tests
  // -------------------------------------------------------------------------

  describe('PATCH', () => {
    it('admin can update status with valid transition — returns 200 and logs audit event', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/maintenance-requests/1?communityId=42',
        {
          method: 'PATCH',
          body: JSON.stringify({ communityId: 42, status: 'acknowledged' }),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(200);
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
          resourceType: 'maintenance_request',
          resourceId: '1',
          communityId: 42,
          oldValues: expect.objectContaining({ status: 'submitted' }),
          newValues: expect.objectContaining({ status: 'acknowledged' }),
        }),
      );
    });

    it('returns 422 for invalid status transition with allowedTransitions in error detail', async () => {
      // resolved → in_progress is not allowed
      createScopedClientMock.mockReturnValue(
        makeDefaultScopedClient({
          requestRows: [makeMaintenanceRow({ status: 'resolved' })],
        }),
      );
      const req = new NextRequest(
        'http://localhost:3000/api/v1/maintenance-requests/1?communityId=42',
        {
          method: 'PATCH',
          body: JSON.stringify({ communityId: 42, status: 'in_progress' }),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(422);
      const body = await res.json() as { error: { details: { allowedTransitions: string[] } } };
      expect(body.error.details.allowedTransitions).toEqual(['closed']);
    });

    it('resident cannot PATCH — returns 403', async () => {
      requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
      const req = new NextRequest(
        'http://localhost:3000/api/v1/maintenance-requests/1?communityId=42',
        {
          method: 'PATCH',
          body: JSON.stringify({ communityId: 42, status: 'acknowledged' }),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(403);
    });

    it('returns 404 when request not found for PATCH', async () => {
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ requestRows: [] }));
      const req = new NextRequest(
        'http://localhost:3000/api/v1/maintenance-requests/1?communityId=42',
        {
          method: 'PATCH',
          body: JSON.stringify({ communityId: 42, status: 'acknowledged' }),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(404);
    });

    it('returns 400 when no fields to update (only communityId in body)', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/maintenance-requests/1?communityId=42',
        {
          method: 'PATCH',
          body: JSON.stringify({ communityId: 42 }),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(400);
    });

    it('returns 400 when assignedToId is not a community admin', async () => {
      // userRoles returns no admin match
      createScopedClientMock.mockReturnValue(
        makeDefaultScopedClient({
          userRoleRows: [{ userId: 'non-admin-user', role: 'owner' }],
        }),
      );
      const req = new NextRequest(
        'http://localhost:3000/api/v1/maintenance-requests/1?communityId=42',
        {
          method: 'PATCH',
          body: JSON.stringify({ communityId: 42, assignedToId: '00000000-0000-0000-0000-000000000001' }),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(400);
    });

    it('status change queues notification with maintenance_update type and no internalNotes', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/maintenance-requests/1?communityId=42',
        {
          method: 'PATCH',
          body: JSON.stringify({ communityId: 42, status: 'acknowledged' }),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(200);

      // Give the void promise a tick to call queueNotification
      await new Promise((r) => setTimeout(r, 0));

      expect(queueNotificationMock).toHaveBeenCalledWith(
        42,
        expect.objectContaining({ type: 'maintenance_update' }),
        expect.objectContaining({ type: 'specific_user', userId: 'session-user-1' }),
        'session-user-1',
      );

      // Verify internalNotes is not in the notification payload
      const notifPayload = queueNotificationMock.mock.calls[0]![1] as Record<string, unknown>;
      expect('internalNotes' in notifPayload).toBe(false);
    });

    it('admin can update internalNotes and audit log captures old/new values', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/maintenance-requests/1?communityId=42',
        {
          method: 'PATCH',
          body: JSON.stringify({ communityId: 42, internalNotes: 'Updated internal note' }),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(200);
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValues: expect.objectContaining({ internalNotes: 'Check under sink first' }),
          newValues: expect.objectContaining({ internalNotes: 'Updated internal note' }),
        }),
      );
    });

    it('legacy open status rows can transition to acknowledged', async () => {
      createScopedClientMock.mockReturnValue(
        makeDefaultScopedClient({
          requestRows: [makeMaintenanceRow({ status: 'open' })],
          updatedRows: [makeMaintenanceRow({ status: 'acknowledged' })],
        }),
      );
      const req = new NextRequest(
        'http://localhost:3000/api/v1/maintenance-requests/1?communityId=42',
        {
          method: 'PATCH',
          body: JSON.stringify({ communityId: 42, status: 'acknowledged' }),
          headers: { 'Content-Type': 'application/json' },
        },
      );
      const res = await PATCH(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // DELETE tests
  // -------------------------------------------------------------------------

  describe('DELETE', () => {
    it('admin can soft-delete a request — returns deleted:true and logs audit event', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/maintenance-requests/1?communityId=42',
        { method: 'DELETE' },
      );
      const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(200);
      const body = await res.json() as { data: { deleted: boolean } };
      expect(body.data.deleted).toBe(true);
      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
          resourceType: 'maintenance_request',
          resourceId: '1',
          communityId: 42,
        }),
      );

      const scopedClient = createScopedClientMock.mock.results[0]!.value as ReturnType<typeof makeDefaultScopedClient>;
      expect(scopedClient.softDelete).toHaveBeenCalled();
    });

    it('resident cannot DELETE — returns 403', async () => {
      requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);
      const req = new NextRequest(
        'http://localhost:3000/api/v1/maintenance-requests/1?communityId=42',
        { method: 'DELETE' },
      );
      const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(403);
    });

    it('returns 404 when request not found for DELETE', async () => {
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ requestRows: [] }));
      const req = new NextRequest(
        'http://localhost:3000/api/v1/maintenance-requests/1?communityId=42',
        { method: 'DELETE' },
      );
      const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(404);
    });

    it('returns 400 when communityId is missing for DELETE', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/maintenance-requests/1',
        { method: 'DELETE' },
      );
      const res = await DELETE(req, { params: Promise.resolve({ id: '1' }) });
      expect(res.status).toBe(400);
    });
  });
});
