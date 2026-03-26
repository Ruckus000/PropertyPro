import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requirePermissionMock,
  resolveEffectiveCommunityIdMock,
  listBroadcastsMock,
  createBroadcastMock,
  executeBroadcastMock,
  cancelBroadcastMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  listBroadcastsMock: vi.fn(),
  createBroadcastMock: vi.fn(),
  executeBroadcastMock: vi.fn(),
  cancelBroadcastMock: vi.fn(),
}));

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

vi.mock('@/lib/services/emergency-broadcast-service', () => ({
  listBroadcasts: listBroadcastsMock,
  createBroadcast: createBroadcastMock,
  executeBroadcast: executeBroadcastMock,
  cancelBroadcast: cancelBroadcastMock,
}));

// Suppress Sentry in test
vi.mock('@sentry/nextjs', () => ({
  withScope: vi.fn(),
  captureException: vi.fn(),
}));


vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: vi.fn().mockResolvedValue(undefined) }));
import { GET, POST } from '../../src/app/api/v1/emergency-broadcasts/route';
import { POST as sendPOST } from '../../src/app/api/v1/emergency-broadcasts/[id]/send/route';
import { POST as cancelPOST } from '../../src/app/api/v1/emergency-broadcasts/[id]/cancel/route';

const MEMBERSHIP = {
  userId: 'user-1',
  communityId: 100,
  role: 'cam',
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'CAM',
  presetKey: 'cam',
  permissions: {
    resources: {
      emergency_broadcasts: { read: true, write: true },
    },
  },
  communityType: 'condo_718' as const,
};

describe('Emergency Broadcast Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    resolveEffectiveCommunityIdMock.mockImplementation(
      (_req: NextRequest, id: number) => id,
    );
  });

  // ── GET /api/v1/emergency-broadcasts ────────────────────────────────────

  describe('GET /api/v1/emergency-broadcasts', () => {
    it('returns paginated list of broadcasts', async () => {
      const broadcasts = [
        { id: 1, title: 'Fire drill', severity: 'emergency' },
        { id: 2, title: 'Water shutoff', severity: 'urgent' },
      ];
      listBroadcastsMock.mockResolvedValue({ broadcasts, total: 2 });

      const req = new NextRequest(
        'http://localhost:3000/api/v1/emergency-broadcasts?communityId=100',
      );
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json).toEqual({
        data: broadcasts,
        total: 2,
        limit: 20,
        offset: 0,
      });
      expect(listBroadcastsMock).toHaveBeenCalledWith(100, 20, 0);
    });

    it('returns error when communityId query param missing', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/emergency-broadcasts',
      );
      const res = await GET(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ── POST /api/v1/emergency-broadcasts ───────────────────────────────────

  describe('POST /api/v1/emergency-broadcasts', () => {
    const validPayload = {
      communityId: 100,
      title: 'Gas Leak Alert',
      body: 'A gas leak has been detected in Building A. Evacuate immediately.',
      severity: 'emergency',
      targetAudience: 'all',
      channels: ['sms', 'email'],
    };

    it('creates draft broadcast with valid input (status 201)', async () => {
      const createdBroadcast = { id: 5, ...validPayload, status: 'draft' };
      createBroadcastMock.mockResolvedValue(createdBroadcast);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/emergency-broadcasts',
        {
          method: 'POST',
          body: JSON.stringify(validPayload),
          headers: { 'content-type': 'application/json' },
        },
      );

      const res = await POST(req);
      const json = await res.json();

      expect(res.status).toBe(201);
      expect(json.id).toBe(5);
      expect(createBroadcastMock).toHaveBeenCalledWith(
        expect.objectContaining({
          communityId: 100,
          title: 'Gas Leak Alert',
          severity: 'emergency',
          initiatedBy: 'user-1',
        }),
      );
    });

    it('returns 422 for missing required fields (empty title)', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/emergency-broadcasts',
        {
          method: 'POST',
          body: JSON.stringify({ ...validPayload, title: '' }),
          headers: { 'content-type': 'application/json' },
        },
      );

      const res = await POST(req);
      expect(res.status).toBe(422);
    });

    it('returns 422 for invalid severity value', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/emergency-broadcasts',
        {
          method: 'POST',
          body: JSON.stringify({ ...validPayload, severity: 'catastrophic' }),
          headers: { 'content-type': 'application/json' },
        },
      );

      const res = await POST(req);
      expect(res.status).toBe(422);
    });
  });

  // ── POST /api/v1/emergency-broadcasts/[id]/send ─────────────────────────

  describe('POST /api/v1/emergency-broadcasts/[id]/send', () => {
    it('executes broadcast and returns result', async () => {
      const sendResult = { broadcastId: 10, recipientCount: 42, status: 'sending' };
      executeBroadcastMock.mockResolvedValue(sendResult);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/emergency-broadcasts/10/send',
        {
          method: 'POST',
          body: JSON.stringify({ communityId: 100 }),
          headers: { 'content-type': 'application/json' },
        },
      );

      const res = await sendPOST(req, {
        params: Promise.resolve({ id: '10' }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.recipientCount).toBe(42);
      expect(executeBroadcastMock).toHaveBeenCalledWith(10, 100, 'user-1');
    });

    it('returns 400 for invalid broadcast ID', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/emergency-broadcasts/abc/send',
        {
          method: 'POST',
          body: JSON.stringify({ communityId: 100 }),
          headers: { 'content-type': 'application/json' },
        },
      );

      const res = await sendPOST(req, {
        params: Promise.resolve({ id: 'abc' }),
      });
      expect(res.status).toBe(400);
    });
  });

  // ── POST /api/v1/emergency-broadcasts/[id]/cancel ───────────────────────

  describe('POST /api/v1/emergency-broadcasts/[id]/cancel', () => {
    it('cancels broadcast within undo window', async () => {
      cancelBroadcastMock.mockResolvedValue(true);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/emergency-broadcasts/10/cancel',
        {
          method: 'POST',
          body: JSON.stringify({ communityId: 100 }),
          headers: { 'content-type': 'application/json' },
        },
      );

      const res = await cancelPOST(req, {
        params: Promise.resolve({ id: '10' }),
      });
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.canceled).toBe(true);
      expect(cancelBroadcastMock).toHaveBeenCalledWith(10, 100, 'user-1');
    });

    it('returns 409 when undo window has expired', async () => {
      cancelBroadcastMock.mockResolvedValue(false);

      const req = new NextRequest(
        'http://localhost:3000/api/v1/emergency-broadcasts/10/cancel',
        {
          method: 'POST',
          body: JSON.stringify({ communityId: 100 }),
          headers: { 'content-type': 'application/json' },
        },
      );

      const res = await cancelPOST(req, {
        params: Promise.resolve({ id: '10' }),
      });
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.error).toContain('Undo window has expired');
    });

    it('returns 400 for invalid broadcast ID', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/emergency-broadcasts/0/cancel',
        {
          method: 'POST',
          body: JSON.stringify({ communityId: 100 }),
          headers: { 'content-type': 'application/json' },
        },
      );

      const res = await cancelPOST(req, {
        params: Promise.resolve({ id: '0' }),
      });
      expect(res.status).toBe(400);
    });
  });
});
