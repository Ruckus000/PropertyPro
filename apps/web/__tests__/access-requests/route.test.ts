/**
 * Unit tests for access-request API route handlers.
 *
 * Tests cover:
 * - POST /api/v1/access-requests: successful submission (201), validation error (400)
 * - GET  /api/v1/access-requests: admin list (200)
 * - POST /api/v1/access-requests/verify: successful OTP verify (200), validation error (400)
 * - POST /api/v1/access-requests/[id]/approve: admin approve (200)
 * - POST /api/v1/access-requests/[id]/deny: admin deny (200)
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  submitAccessRequestMock,
  verifyOtpMock,
  approveAccessRequestMock,
  denyAccessRequestMock,
  listPendingRequestsMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  resolveEffectiveCommunityIdMock,
} = vi.hoisted(() => ({
  submitAccessRequestMock: vi.fn(),
  verifyOtpMock: vi.fn(),
  approveAccessRequestMock: vi.fn(),
  denyAccessRequestMock: vi.fn(),
  listPendingRequestsMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
}));

// Mock the access-request service
vi.mock('@/lib/services/access-request-service', () => ({
  submitAccessRequest: submitAccessRequestMock,
  verifyOtp: verifyOtpMock,
  approveAccessRequest: approveAccessRequestMock,
  denyAccessRequest: denyAccessRequestMock,
  listPendingRequests: listPendingRequestsMock,
}));

// Mock auth helpers
vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

// Prevent DATABASE_URL eager load from @propertypro/db/unsafe
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

// Mock error handler to pass through
vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));

vi.mock('@/lib/api/errors', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ValidationError';
    }
  },
  NotFoundError: class NotFoundError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'NotFoundError';
    }
  },
  ForbiddenError: class ForbiddenError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ForbiddenError';
    }
  },
}));


vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
// ---------------------------------------------------------------------------
// Import routes after mocks
// ---------------------------------------------------------------------------

import { POST as submitPOST, GET as listGET } from '../../src/app/api/v1/access-requests/route';
import { POST as verifyPOST } from '../../src/app/api/v1/access-requests/verify/route';
import { POST as approvePOST } from '../../src/app/api/v1/access-requests/[id]/approve/route';
import { POST as denyPOST } from '../../src/app/api/v1/access-requests/[id]/deny/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(url: string, opts?: RequestInit) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), opts);
}

function makeJsonRequest(url: string, body: unknown, method = 'POST') {
  return new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
}

function makeRouteParams(params: Record<string, string>) {
  return { params: Promise.resolve(params) };
}

const defaultMembership = {
  userId: 'user-admin-1',
  communityId: 1,
  role: 'manager',
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  presetKey: 'board_president',
  communityType: 'condo_718',
  communityName: 'Sunset Condos',
  permissions: {
    resources: {
      residents: { read: true, write: true },
      documents: { read: true, write: true },
      meetings: { read: true, write: true },
      announcements: { read: true, write: true },
      compliance: { read: true, write: true },
      financial: { read: true, write: true },
      maintenance: { read: true, write: true },
      violations: { read: true, write: true },
      leases: { read: true, write: true },
      contracts: { read: true, write: true },
      polls: { read: true, write: true },
      settings: { read: true, write: true },
      audit: { read: true, write: true },
      esign: { read: true, write: true },
      arc_submissions: { read: true, write: true },
      work_orders: { read: true, write: true },
      amenities: { read: true, write: true },
      packages: { read: true, write: true },
      visitors: { read: true, write: true },
      calendar_sync: { read: true, write: true },
      accounting: { read: true, write: true },
      finances: { read: true, write: true },
    },
  },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Access Request Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin-1');
    requireCommunityMembershipMock.mockResolvedValue(defaultMembership);
    requirePermissionMock.mockReturnValue(undefined);
    resolveEffectiveCommunityIdMock.mockReturnValue(1);
  });

  // =========================================================================
  // POST /api/v1/access-requests — public submit
  // =========================================================================

  describe('POST /api/v1/access-requests', () => {
    const validBody = {
      communityId: 1,
      communitySlug: 'sunset-condos',
      email: 'jane@example.com',
      fullName: 'Jane Smith',
      phone: '555-1234',
      claimedUnitNumber: '4B',
      isUnitOwner: true,
      refCode: 'ABC123',
    };

    it('returns 201 with requestId on successful submission', async () => {
      submitAccessRequestMock.mockResolvedValue({ requestId: 42, resent: false });

      const req = makeJsonRequest('/api/v1/access-requests', validBody);
      const response = await submitPOST(req);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.data.requestId).toBe(42);
      expect(json.data.resent).toBe(false);
      expect(submitAccessRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({
          communityId: 1,
          communitySlug: 'sunset-condos',
          email: 'jane@example.com',
          fullName: 'Jane Smith',
          isUnitOwner: true,
        }),
      );
    });

    it('returns resent=true when OTP is resent for existing pending request', async () => {
      submitAccessRequestMock.mockResolvedValue({ requestId: 42, resent: true });

      const req = makeJsonRequest('/api/v1/access-requests', validBody);
      const response = await submitPOST(req);
      const json = await response.json();

      expect(response.status).toBe(201);
      expect(json.data.resent).toBe(true);
    });

    it('throws ValidationError when required fields are missing', async () => {
      const invalidBody = {
        communityId: 1,
        // missing communitySlug, email, fullName
        isUnitOwner: false,
      };

      const req = makeJsonRequest('/api/v1/access-requests', invalidBody);
      await expect(submitPOST(req)).rejects.toThrow('Validation failed');
      expect(submitAccessRequestMock).not.toHaveBeenCalled();
    });

    it('throws ValidationError when email is invalid', async () => {
      const req = makeJsonRequest('/api/v1/access-requests', {
        ...validBody,
        email: 'not-an-email',
      });
      await expect(submitPOST(req)).rejects.toThrow('Validation failed');
    });

    it('does not require optional fields (phone, claimedUnitNumber, refCode)', async () => {
      submitAccessRequestMock.mockResolvedValue({ requestId: 10, resent: false });

      const minimalBody = {
        communityId: 1,
        communitySlug: 'sunset-condos',
        email: 'min@example.com',
        fullName: 'Min User',
        isUnitOwner: false,
      };

      const req = makeJsonRequest('/api/v1/access-requests', minimalBody);
      const response = await submitPOST(req);
      expect(response.status).toBe(201);
    });
  });

  // =========================================================================
  // GET /api/v1/access-requests — admin list
  // =========================================================================

  describe('GET /api/v1/access-requests', () => {
    it('returns pending requests for admin user', async () => {
      const pendingRows = [
        { id: 1, email: 'a@test.com', fullName: 'Alice', status: 'pending' },
        { id: 2, email: 'b@test.com', fullName: 'Bob', status: 'pending' },
      ];
      listPendingRequestsMock.mockResolvedValue(pendingRows);

      const req = makeRequest('/api/v1/access-requests');
      const response = await listGET(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(2);
      expect(requireAuthenticatedUserIdMock).toHaveBeenCalled();
      expect(requirePermissionMock).toHaveBeenCalledWith(
        defaultMembership,
        'residents',
        'write',
      );
      expect(listPendingRequestsMock).toHaveBeenCalledWith(1);
    });

    it('returns empty array when no pending requests', async () => {
      listPendingRequestsMock.mockResolvedValue([]);

      const req = makeRequest('/api/v1/access-requests');
      const response = await listGET(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data).toHaveLength(0);
    });
  });

  // =========================================================================
  // POST /api/v1/access-requests/verify — OTP verify
  // =========================================================================

  describe('POST /api/v1/access-requests/verify', () => {
    const validBody = {
      requestId: 42,
      otp: '123456',
      communityId: 1,
    };

    it('returns verified=true on successful OTP verification', async () => {
      verifyOtpMock.mockResolvedValue({ verified: true });

      const req = makeJsonRequest('/api/v1/access-requests/verify', validBody);
      const response = await verifyPOST(req);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.verified).toBe(true);
      expect(verifyOtpMock).toHaveBeenCalledWith({
        requestId: 42,
        otp: '123456',
        communityId: 1,
      });
    });

    it('throws ValidationError when OTP is not exactly 6 characters', async () => {
      const req = makeJsonRequest('/api/v1/access-requests/verify', {
        ...validBody,
        otp: '12345', // too short
      });
      await expect(verifyPOST(req)).rejects.toThrow('Validation failed');
    });

    it('throws ValidationError when requestId is missing', async () => {
      const req = makeJsonRequest('/api/v1/access-requests/verify', {
        otp: '123456',
        communityId: 1,
      });
      await expect(verifyPOST(req)).rejects.toThrow('Validation failed');
    });

    it('throws ValidationError when communityId is missing', async () => {
      const req = makeJsonRequest('/api/v1/access-requests/verify', {
        requestId: 42,
        otp: '123456',
      });
      await expect(verifyPOST(req)).rejects.toThrow('Validation failed');
    });
  });

  // =========================================================================
  // POST /api/v1/access-requests/[id]/approve — admin approve
  // =========================================================================

  describe('POST /api/v1/access-requests/[id]/approve', () => {
    it('approves request and returns userId', async () => {
      approveAccessRequestMock.mockResolvedValue({ userId: 'new-user-uuid' });

      const req = makeJsonRequest('/api/v1/access-requests/5/approve', { unitId: 3 });
      const context = makeRouteParams({ id: '5' });

      const response = await approvePOST(req, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.userId).toBe('new-user-uuid');
      expect(approveAccessRequestMock).toHaveBeenCalledWith({
        requestId: 5,
        communityId: 1,
        reviewerId: 'user-admin-1',
        unitId: 3,
      });
    });

    it('approves request without unitId (optional)', async () => {
      approveAccessRequestMock.mockResolvedValue({ userId: 'new-user-uuid' });

      const req = makeJsonRequest('/api/v1/access-requests/5/approve', {});
      const context = makeRouteParams({ id: '5' });

      await approvePOST(req, context);

      expect(approveAccessRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({ unitId: undefined }),
      );
    });

    it('checks residents.write permission', async () => {
      approveAccessRequestMock.mockResolvedValue({ userId: 'new-user-uuid' });

      const req = makeJsonRequest('/api/v1/access-requests/5/approve', {});
      const context = makeRouteParams({ id: '5' });

      await approvePOST(req, context);

      expect(requirePermissionMock).toHaveBeenCalledWith(
        defaultMembership,
        'residents',
        'write',
      );
    });
  });

  // =========================================================================
  // POST /api/v1/access-requests/[id]/deny — admin deny
  // =========================================================================

  describe('POST /api/v1/access-requests/[id]/deny', () => {
    it('denies request and returns success', async () => {
      denyAccessRequestMock.mockResolvedValue(undefined);

      const req = makeJsonRequest('/api/v1/access-requests/7/deny', {
        reason: 'Unable to verify identity',
      });
      const context = makeRouteParams({ id: '7' });

      const response = await denyPOST(req, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.data.success).toBe(true);
      expect(denyAccessRequestMock).toHaveBeenCalledWith({
        requestId: 7,
        communityId: 1,
        reviewerId: 'user-admin-1',
        reason: 'Unable to verify identity',
      });
    });

    it('denies request without reason (optional)', async () => {
      denyAccessRequestMock.mockResolvedValue(undefined);

      const req = makeJsonRequest('/api/v1/access-requests/7/deny', {});
      const context = makeRouteParams({ id: '7' });

      const response = await denyPOST(req, context);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(denyAccessRequestMock).toHaveBeenCalledWith(
        expect.objectContaining({ reason: undefined }),
      );
    });

    it('checks residents.write permission', async () => {
      denyAccessRequestMock.mockResolvedValue(undefined);

      const req = makeJsonRequest('/api/v1/access-requests/7/deny', {});
      const context = makeRouteParams({ id: '7' });

      await denyPOST(req, context);

      expect(requirePermissionMock).toHaveBeenCalledWith(
        defaultMembership,
        'residents',
        'write',
      );
    });

    it('throws ValidationError when reason exceeds 500 characters', async () => {
      const req = makeJsonRequest('/api/v1/access-requests/7/deny', {
        reason: 'x'.repeat(501),
      });
      const context = makeRouteParams({ id: '7' });

      await expect(denyPOST(req, context)).rejects.toThrow('Validation failed');
    });
  });
});
