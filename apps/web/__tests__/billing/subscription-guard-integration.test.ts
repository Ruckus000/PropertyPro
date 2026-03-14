/**
 * P0 Integration tests — subscription gate end-to-end
 *
 * These tests do NOT mock @/lib/middleware/subscription-guard.
 * The real guard runs, with its DB dependency (@propertypro/db/unsafe) mocked
 * to return a controlled subscriptionStatus.
 *
 * This is the only place in the test suite that verifies the full chain:
 *   Route handler → requireActiveSubscriptionForMutation → 403 SUBSCRIPTION_REQUIRED
 *
 * Why this matters (P0 — Day 14 lock):
 *   All other route tests mock the guard away. If someone accidentally removed
 *   the guard call from a route, those unit tests would not catch it. This file
 *   does catch it because the real guard is exercised.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  createUnscopedClientMock,
  eqMock,
  communitiesTable,
  createScopedClientMock,
  auditLogMock,
  logAuditEventMock,
  queueAnnouncementDeliveryMock,
  announcementsTableMock,
  usersTableMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
} = vi.hoisted(() => ({
  createUnscopedClientMock: vi.fn(),
  eqMock: vi.fn((col: unknown, val: unknown) => ({ _eq: [col, val] })),
  communitiesTable: {
    id: 'communities.id',
    subscriptionStatus: 'communities.subscription_status',
  },
  createScopedClientMock: vi.fn(),
  auditLogMock: vi.fn().mockResolvedValue(undefined),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  queueAnnouncementDeliveryMock: vi.fn().mockResolvedValue(3),
  announcementsTableMock: { id: Symbol('announcements.id') },
  usersTableMock: Symbol('users'),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks — DO NOT mock @/lib/middleware/subscription-guard
// ---------------------------------------------------------------------------

// The real guard's DB dependency
vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: createUnscopedClientMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: eqMock,
}));

vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  createScopedClient: createScopedClientMock,
  announcements: announcementsTableMock,
  users: usersTableMock,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/middleware/audit-middleware', () => ({
  withAuditLog: (extractContext: unknown, handler: unknown) => {
    return async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
      const extracted = await (extractContext as (
        r: NextRequest,
        c?: { params: Promise<Record<string, string>> },
      ) => Promise<{ userId: string; communityId: number }>)(req, context);
      return (handler as (r: NextRequest, c: unknown, audit: unknown) => Promise<Response>)(
        req,
        context,
        { ...extracted, log: auditLogMock },
      );
    };
  },
}));

vi.mock('@/lib/services/announcement-delivery', () => ({
  queueAnnouncementDelivery: queueAnnouncementDeliveryMock,
}));

// Route import — after all mocks
import { POST } from '../../src/app/api/v1/announcements/route';
import { getPresetPermissions } from '@propertypro/shared';

// ---------------------------------------------------------------------------
// Helper: configure the real guard's DB mock
// ---------------------------------------------------------------------------

function setupGuardDb(subscriptionStatus: string): void {
  const limitMock = vi.fn().mockResolvedValue([{ subscriptionStatus }]);
  const whereMock = vi.fn(() => ({ limit: limitMock }));
  const fromMock = vi.fn(() => ({ where: whereMock }));
  const selectMock = vi.fn(() => ({ from: fromMock }));
  createUnscopedClientMock.mockReturnValue({ select: selectMock });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('P0: subscription gate end-to-end (real guard — no mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-p0-1');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-p0-1',
      communityId: 1,
      communityName: 'Test',
      role: 'manager',
      communityType: 'condo_718',
      timezone: 'America/New_York',
      isUnitOwner: false,
      isAdmin: true,
      displayTitle: 'Board Member',
      presetKey: 'board_member',
      permissions: getPresetPermissions('board_member', 'condo_718'),
    });
    createScopedClientMock.mockReturnValue({
      query: vi.fn().mockImplementation(async (table: unknown) => {
        if (table === usersTableMock) {
          return [{ id: 'user-p0-1', fullName: 'P0 Test User' }];
        }
        return [];
      }),
      insert: vi.fn().mockResolvedValue([
        { id: 1, title: 'Test', body: 'body', audience: 'all', isPinned: false },
      ]),
      update: vi.fn().mockResolvedValue([]),
    });
  });

  it('POST returns 403 with SUBSCRIPTION_REQUIRED when subscriptionStatus is "canceled"', async () => {
    setupGuardDb('canceled');

    const req = new NextRequest('http://localhost:3000/api/v1/announcements', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Announcement',
        body: 'Test body',
        audience: 'all',
        isPinned: false,
        communityId: 1,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(403);

    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('SUBSCRIPTION_REQUIRED');
  });

  it('POST returns 201 when subscriptionStatus is "active"', async () => {
    setupGuardDb('active');

    const req = new NextRequest('http://localhost:3000/api/v1/announcements', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Announcement',
        body: 'Test body',
        audience: 'all',
        isPinned: false,
        communityId: 1,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it('POST returns 403 with SUBSCRIPTION_REQUIRED when subscriptionStatus is "expired"', async () => {
    setupGuardDb('expired');

    const req = new NextRequest('http://localhost:3000/api/v1/announcements', {
      method: 'POST',
      body: JSON.stringify({
        title: 'Test Announcement',
        body: 'Test body',
        audience: 'all',
        isPinned: false,
        communityId: 1,
      }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('SUBSCRIPTION_REQUIRED');
  });
});
