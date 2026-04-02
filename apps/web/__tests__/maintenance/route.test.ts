/**
 * Unit tests for maintenance requests API route (P3-50).
 *
 * Tests cover:
 * - Feature gate: apartment community blocked when hasMaintenanceRequests=false
 * - Missing communityId → 400
 * - Admin GET returns data/meta
 * - Resident isolation: own requests only
 * - Internal comment stripping for resident callers
 * - Legacy status/priority normalization
 * - POST create: 201, audit log, invalid communityId, missing fields
 * - Photo path cross-tenant validation
 * - Photo count limit (max 5 via Zod)
 * - Priority legacy normalization (emergency → urgent)
 * - POST add_comment: admin internal, resident isInternal=false, resident own-request gate
 * - POST request_upload_url: success, photo limit, ownership check, unknown action
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  createScopedClientMock,
  logAuditEventMock,
  createPresignedDownloadUrlMock,
  maintenanceRequestsTableMock,
  maintenanceCommentsTableMock,
  unitsTableMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  getMaintenancePhotoUploadUrlMock,
  processAndStoreThumbnailMock,
  getFeaturesForCommunityMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  createPresignedDownloadUrlMock: vi.fn().mockResolvedValue('https://storage.example.com/download/path'),
  maintenanceRequestsTableMock: { id: Symbol('maintenanceRequests.id'), submittedById: Symbol('maintenanceRequests.submittedById'), status: Symbol('maintenanceRequests.status'), category: Symbol('maintenanceRequests.category'), priority: Symbol('maintenanceRequests.priority'), assignedToId: Symbol('maintenanceRequests.assignedToId') },
  maintenanceCommentsTableMock: { requestId: Symbol('maintenanceComments.requestId') },
  unitsTableMock: { id: Symbol('units.id') },
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  getMaintenancePhotoUploadUrlMock: vi.fn().mockResolvedValue({
    uploadUrl: 'https://storage.example.com/upload',
    storagePath: 'maintenance/42/tmp/file.jpg',
  }),
  processAndStoreThumbnailMock: vi.fn().mockResolvedValue(undefined),
  getFeaturesForCommunityMock: vi.fn().mockReturnValue({ hasMaintenanceRequests: true }),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
  maintenanceRequests: maintenanceRequestsTableMock,
  maintenanceComments: maintenanceCommentsTableMock,
  units: unitsTableMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: vi.fn().mockReturnValue('eq-filter'),
  and: vi.fn().mockReturnValue('and-filter'),
  inArray: vi.fn().mockReturnValue('inarray-filter'),
}));

vi.mock('@propertypro/shared', () => ({
  getFeaturesForCommunity: getFeaturesForCommunityMock,
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
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/services/photo-processor', () => ({
  getMaintenancePhotoUploadUrl: getMaintenancePhotoUploadUrlMock,
  processAndStoreThumbnail: processAndStoreThumbnailMock,
}));

import { GET, POST } from '../../src/app/api/v1/maintenance-requests/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Full membership shape required by route logic.
 */
const ADMIN_MEMBERSHIP = {
  userId: 'session-user-1',
  communityId: 42,
  role: 'board_president',
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  presetKey: 'board_president',
  communityType: 'condo_718' as const,
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
  ...ADMIN_MEMBERSHIP,
  role: 'owner',
  isAdmin: false,
  isUnitOwner: true,
  displayTitle: 'Owner',
  presetKey: 'owner',
};

function makeChainableBuilder(rows: unknown[]) {
  const builder: Record<string, unknown> = {};
  builder.limit = vi.fn().mockReturnValue(builder);
  builder.offset = vi.fn().mockReturnValue(builder);
  builder.orderBy = vi.fn().mockReturnValue(builder);
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(rows).then(resolve);
  return builder;
}

function makeDefaultScopedClient(overrides: Record<string, unknown> = {}) {
  const selectFrom = vi.fn().mockImplementation((table: unknown) => {
    if (table === maintenanceRequestsTableMock) return makeChainableBuilder([]);
    if (table === maintenanceCommentsTableMock) return makeChainableBuilder([]);
    if (table === unitsTableMock) return makeChainableBuilder([]);
    return makeChainableBuilder([]);
  });

  return {
    selectFrom,
    insert: vi.fn().mockResolvedValue([{ id: 1, communityId: 42 }]),
    update: vi.fn().mockResolvedValue([{ id: 1, communityId: 42 }]),
    softDelete: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Test suites
// ---------------------------------------------------------------------------

describe('maintenance requests route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('session-user-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    getFeaturesForCommunityMock.mockReturnValue({ hasMaintenanceRequests: true });
    createScopedClientMock.mockReturnValue(makeDefaultScopedClient());
  });

  // -------------------------------------------------------------------------
  // GET — Feature gate
  // -------------------------------------------------------------------------

  describe('feature gate', () => {
    it('GET returns 403 when hasMaintenanceRequests is false', async () => {
      getFeaturesForCommunityMock.mockReturnValue({ hasMaintenanceRequests: false });

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(403);
    });

    it('GET returns 200 for condo_718 community type', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === maintenanceRequestsTableMock) return makeChainableBuilder([]);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(200);
    });

    it('GET returns 200 for hoa_720 community type', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        ...ADMIN_MEMBERSHIP,
        communityType: 'hoa_720',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(200);
    });
  });

  // -------------------------------------------------------------------------
  // GET — Validation
  // -------------------------------------------------------------------------

  describe('GET validation', () => {
    it('returns 400 when communityId query param is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests');
      const res = await GET(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('communityId');
    });
  });

  // -------------------------------------------------------------------------
  // GET — Admin listing
  // -------------------------------------------------------------------------

  describe('GET admin listing', () => {
    it('uses createScopedClient with communityId and returns data/meta shape', async () => {
      const requestRow = {
        id: 10,
        communityId: 42,
        submittedById: 'user-abc',
        title: 'Leaky faucet',
        description: 'Dripping fast',
        status: 'submitted',
        priority: 'high',
        category: 'plumbing',
        photos: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === maintenanceRequestsTableMock) return makeChainableBuilder([requestRow]);
        if (table === maintenanceCommentsTableMock) return makeChainableBuilder([]);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(200);
      expect(createScopedClientMock).toHaveBeenCalledWith(42);

      const json = (await res.json()) as { data: unknown[]; meta: { total: number; page: number; limit: number } };
      expect(json.meta).toBeDefined();
      expect(typeof json.meta.total).toBe('number');
      expect(typeof json.meta.page).toBe('number');
      expect(typeof json.meta.limit).toBe('number');
      expect(Array.isArray(json.data)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // GET — Resident isolation
  // -------------------------------------------------------------------------

  describe('GET resident isolation', () => {
    it('applies submittedById filter for resident role callers', async () => {
      requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);

      const { eq } = await import('@propertypro/db/filters');
      const eqMock = eq as ReturnType<typeof vi.fn>;

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests?communityId=42');
      await GET(req);

      // eq should have been called with submittedById column and the actor user id
      expect(eqMock).toHaveBeenCalledWith(
        maintenanceRequestsTableMock.submittedById,
        'session-user-1',
      );
    });
  });

  // -------------------------------------------------------------------------
  // GET — Internal comment stripping
  // -------------------------------------------------------------------------

  describe('GET internal comment stripping', () => {
    it('strips internal comments from response for resident callers', async () => {
      requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);

      const requestRow = {
        id: 20,
        communityId: 42,
        submittedById: 'session-user-1',
        title: 'Broken door',
        description: 'Handle fell off',
        status: 'submitted',
        priority: 'low',
        category: 'general',
        photos: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const internalComment = { id: 1, requestId: 20, userId: 'admin-1', text: 'Admin note', isInternal: true, createdAt: new Date().toISOString() };
      const publicComment = { id: 2, requestId: 20, userId: 'admin-1', text: 'Public note', isInternal: false, createdAt: new Date().toISOString() };

      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === maintenanceRequestsTableMock) return makeChainableBuilder([requestRow]);
        if (table === maintenanceCommentsTableMock) return makeChainableBuilder([internalComment, publicComment]);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = (await res.json()) as { data: Array<{ comments: Array<{ isInternal: boolean }> }> };
      const comments = json.data[0].comments;
      // All returned comments should have isInternal=false
      expect(comments.every((c) => !c.isInternal)).toBe(true);
      expect(comments).toHaveLength(1);
    });

    it('does NOT strip internal comments for admin callers', async () => {
      const requestRow = {
        id: 21,
        communityId: 42,
        submittedById: 'session-user-1',
        title: 'Broken heater',
        description: 'Not heating',
        status: 'in_progress',
        priority: 'high',
        category: 'hvac',
        photos: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const internalComment = { id: 3, requestId: 21, userId: 'admin-1', text: 'Internal note', isInternal: true, createdAt: new Date().toISOString() };

      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === maintenanceRequestsTableMock) return makeChainableBuilder([requestRow]);
        if (table === maintenanceCommentsTableMock) return makeChainableBuilder([internalComment]);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = (await res.json()) as { data: Array<{ comments: Array<{ isInternal: boolean }> }> };
      expect(json.data[0].comments).toHaveLength(1);
      expect(json.data[0].comments[0].isInternal).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // GET — Legacy status/priority normalization
  // -------------------------------------------------------------------------

  describe('GET legacy normalization', () => {
    it("normalizes status 'open' to 'submitted'", async () => {
      const requestRow = {
        id: 30,
        communityId: 42,
        submittedById: 'user-abc',
        title: 'Old request',
        description: 'Legacy',
        status: 'open',
        priority: 'high',
        category: 'general',
        photos: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === maintenanceRequestsTableMock) return makeChainableBuilder([requestRow]);
        if (table === maintenanceCommentsTableMock) return makeChainableBuilder([]);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = (await res.json()) as { data: Array<{ status: string }> };
      expect(json.data[0].status).toBe('submitted');
    });

    it("normalizes priority 'normal' to 'medium'", async () => {
      const requestRow = {
        id: 31,
        communityId: 42,
        submittedById: 'user-abc',
        title: 'Normal priority request',
        description: 'Legacy priority',
        status: 'submitted',
        priority: 'normal',
        category: 'general',
        photos: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === maintenanceRequestsTableMock) return makeChainableBuilder([requestRow]);
        if (table === maintenanceCommentsTableMock) return makeChainableBuilder([]);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests?communityId=42');
      const res = await GET(req);
      expect(res.status).toBe(200);

      const json = (await res.json()) as { data: Array<{ priority: string }> };
      expect(json.data[0].priority).toBe('medium');
    });
  });

  // -------------------------------------------------------------------------
  // POST — create action
  // -------------------------------------------------------------------------

  describe('POST action: create', () => {
    it('creates a request, returns 201, and logs audit event', async () => {
      const insert = vi.fn().mockResolvedValue([{ id: 99, communityId: 42, title: 'Leaky pipe' }]);
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ insert }));

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          communityId: 42,
          title: 'Leaky pipe',
          description: 'Water dripping from ceiling',
          category: 'plumbing',
          priority: 'high',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      const json = (await res.json()) as { data: { id: number } };
      expect(json.data.id).toBe(99);

      expect(logAuditEventMock).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
          resourceType: 'maintenance_request',
          resourceId: '99',
          communityId: 42,
        }),
      );
    });

    it('returns 400 when communityId is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          title: 'No community',
          description: 'Missing communityId',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it('returns 400 when title is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          communityId: 42,
          description: 'No title provided',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('Invalid request payload');
    });

    it('returns 400 for photo path not matching community prefix', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          communityId: 42,
          title: 'With photo',
          description: 'Photo from another community',
          storagePaths: ['maintenance/99/tmp/photo.jpg'], // wrong communityId
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('Invalid storage path');
    });

    it('returns 400 when storagePaths exceeds 5 items', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          communityId: 42,
          title: 'Too many photos',
          description: 'Six photos provided',
          storagePaths: [
            'maintenance/42/tmp/1.jpg',
            'maintenance/42/tmp/2.jpg',
            'maintenance/42/tmp/3.jpg',
            'maintenance/42/tmp/4.jpg',
            'maintenance/42/tmp/5.jpg',
            'maintenance/42/tmp/6.jpg',
          ],
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
    });

    it("coerces priority 'emergency' to 'urgent'", async () => {
      const insert = vi.fn().mockResolvedValue([{ id: 55, communityId: 42 }]);
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ insert }));

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'create',
          communityId: 42,
          title: 'Emergency flood',
          description: 'Water everywhere',
          priority: 'emergency',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      // insert should have been called with priority: 'urgent'
      expect(insert).toHaveBeenCalledWith(
        maintenanceRequestsTableMock,
        expect.objectContaining({ priority: 'urgent' }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // POST — add_comment action
  // -------------------------------------------------------------------------

  describe('POST action: add_comment', () => {
    it('admin can add an internal comment (isInternal stored as true)', async () => {
      const existingRequest = { id: 10, communityId: 42, submittedById: 'other-user' };
      const insert = vi.fn().mockResolvedValue([{ id: 5, requestId: 10, isInternal: true }]);
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === maintenanceRequestsTableMock) return makeChainableBuilder([existingRequest]);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom, insert }));

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add_comment',
          communityId: 42,
          requestId: 10,
          text: 'Internal admin note',
          isInternal: true,
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      expect(insert).toHaveBeenCalledWith(
        maintenanceCommentsTableMock,
        expect.objectContaining({ isInternal: true }),
      );
    });

    it('resident comment forces isInternal=false regardless of request body', async () => {
      requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);

      const existingRequest = { id: 10, communityId: 42, submittedById: 'session-user-1' };
      const insert = vi.fn().mockResolvedValue([{ id: 6, requestId: 10, isInternal: false }]);
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === maintenanceRequestsTableMock) return makeChainableBuilder([existingRequest]);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom, insert }));

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add_comment',
          communityId: 42,
          requestId: 10,
          text: 'Resident trying to post internal comment',
          isInternal: true, // should be overridden to false
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(201);

      expect(insert).toHaveBeenCalledWith(
        maintenanceCommentsTableMock,
        expect.objectContaining({ isInternal: false }),
      );
    });

    it('resident gets 403 when trying to comment on someone else request', async () => {
      requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);

      // Request belongs to a different user
      const existingRequest = { id: 10, communityId: 42, submittedById: 'other-user-999' };
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === maintenanceRequestsTableMock) return makeChainableBuilder([existingRequest]);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add_comment',
          communityId: 42,
          requestId: 10,
          text: 'Should not be allowed',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it('returns 400 when request is not found in community', async () => {
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === maintenanceRequestsTableMock) return makeChainableBuilder([]); // not found
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'add_comment',
          communityId: 42,
          requestId: 9999,
          text: 'Comment on ghost request',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('not found');
    });
  });

  // -------------------------------------------------------------------------
  // POST — request_upload_url action
  // -------------------------------------------------------------------------

  describe('POST action: request_upload_url', () => {
    it('returns uploadUrl and storagePath on success', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'request_upload_url',
          communityId: 42,
          filename: 'photo.jpg',
          fileSize: 1024 * 100,
          mimeType: 'image/jpeg',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(200);

      const json = (await res.json()) as { data: { uploadUrl: string; storagePath: string } };
      expect(json.data.uploadUrl).toBe('https://storage.example.com/upload');
      expect(json.data.storagePath).toBe('maintenance/42/tmp/file.jpg');
    });

    it('returns 400 with PHOTO_LIMIT_EXCEEDED when resident has 5 existing photos', async () => {
      requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);

      const existingRequest = {
        id: 10,
        communityId: 42,
        submittedById: 'session-user-1',
        photos: [
          { storagePath: 'maintenance/42/1.jpg' },
          { storagePath: 'maintenance/42/2.jpg' },
          { storagePath: 'maintenance/42/3.jpg' },
          { storagePath: 'maintenance/42/4.jpg' },
          { storagePath: 'maintenance/42/5.jpg' },
        ],
      };
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === maintenanceRequestsTableMock) return makeChainableBuilder([existingRequest]);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'request_upload_url',
          communityId: 42,
          requestId: 10,
          filename: 'extra.jpg',
          fileSize: 1024 * 100,
          mimeType: 'image/jpeg',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { code: string; message: string; details?: { code?: string } } };
      // PHOTO_LIMIT_EXCEEDED is stored in error.details.code (details passed to ValidationError constructor)
      expect(json.error.details?.code).toBe('PHOTO_LIMIT_EXCEEDED');
    });

    it('returns 403 when resident tries to upload to another user request', async () => {
      requireCommunityMembershipMock.mockResolvedValue(RESIDENT_MEMBERSHIP);

      const existingRequest = {
        id: 10,
        communityId: 42,
        submittedById: 'other-user-999', // not the actor
        photos: null,
      };
      const selectFrom = vi.fn().mockImplementation((table: unknown) => {
        if (table === maintenanceRequestsTableMock) return makeChainableBuilder([existingRequest]);
        return makeChainableBuilder([]);
      });
      createScopedClientMock.mockReturnValue(makeDefaultScopedClient({ selectFrom }));

      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'request_upload_url',
          communityId: 42,
          requestId: 10,
          filename: 'photo.jpg',
          fileSize: 1024 * 100,
          mimeType: 'image/jpeg',
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it('returns 400 for unknown action', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/maintenance-requests', {
        method: 'POST',
        body: JSON.stringify({
          action: 'delete_everything',
          communityId: 42,
        }),
        headers: { 'content-type': 'application/json' },
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: { message: string } };
      expect(json.error.message).toContain('Unknown action');
    });
  });
});
