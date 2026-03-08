import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  createScopedClientMock,
  logAuditEventMock,
  queryMock,
  updateMock,
  communitiesTable,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  ensureTransparencyChecklistInitializedMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  queryMock: vi.fn(),
  updateMock: vi.fn(),
  communitiesTable: Symbol('communities'),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  ensureTransparencyChecklistInitializedMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  communities: communitiesTable,
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/services/transparency-service', () => ({
  ensureTransparencyChecklistInitialized: ensureTransparencyChecklistInitializedMock,
}));

import { GET, PATCH } from '../../src/app/api/v1/transparency/settings/route';

function makePatchRequest(body: Record<string, unknown>, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/transparency/settings', {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('transparency settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    requireAuthenticatedUserIdMock.mockResolvedValue('user-123');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-123',
      communityId: 42,
      role: 'board_president',
      communityType: 'condo_718',
    });

    queryMock.mockResolvedValue([
      {
        id: 42,
        slug: 'sunset-condos',
        transparencyEnabled: false,
        transparencyAcknowledgedAt: null,
      },
    ]);
    updateMock.mockResolvedValue([]);

    createScopedClientMock.mockReturnValue({
      query: queryMock,
      update: updateMock,
    });

    ensureTransparencyChecklistInitializedMock.mockResolvedValue([
      {
        id: 100,
        templateKey: '718_bylaws',
      },
    ]);
  });

  it('GET allows settings read role and returns transparency state', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      userId: 'user-123',
      communityId: 42,
      role: 'board_member',
      communityType: 'condo_718',
    });

    queryMock.mockResolvedValueOnce([
      {
        id: 42,
        transparencyEnabled: true,
        transparencyAcknowledgedAt: new Date('2026-03-07T12:00:00.000Z'),
      },
    ]);

    const res = await GET(new NextRequest('http://localhost:3000/api/v1/transparency/settings?communityId=42'));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { enabled: boolean; acknowledgedAt: string | null };
    };
    expect(json.data.enabled).toBe(true);
    expect(json.data.acknowledgedAt).toBe('2026-03-07T12:00:00.000Z');
  });

  it('GET returns 404 when transparency is unavailable for community type', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      userId: 'user-123',
      communityId: 42,
      role: 'site_manager',
      communityType: 'apartment',
    });

    const res = await GET(new NextRequest('http://localhost:3000/api/v1/transparency/settings?communityId=42'));
    expect(res.status).toBe(404);
  });

  it('GET returns 404 when header and query community IDs conflict', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/transparency/settings?communityId=42', {
        headers: {
          'x-community-id': '99',
        },
      }),
    );

    expect(res.status).toBe(404);
  });

  it('PATCH denies board_member write access', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      userId: 'user-123',
      communityId: 42,
      role: 'board_member',
      communityType: 'condo_718',
    });

    const res = await PATCH(
      makePatchRequest({
        communityId: 42,
        enabled: true,
        acknowledged: true,
      }),
    );

    expect(res.status).toBe(403);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('PATCH enables transparency, initializes checklist, and logs audit event', async () => {
    const res = await PATCH(
      makePatchRequest({
        communityId: 42,
        enabled: true,
        acknowledged: true,
      }),
    );

    expect(res.status).toBe(200);
    expect(ensureTransparencyChecklistInitializedMock).toHaveBeenCalledWith(42, 'condo_718');
    expect(updateMock).toHaveBeenCalledWith(
      communitiesTable,
      expect.objectContaining({
        transparencyEnabled: true,
      }),
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings_changed',
        resourceType: 'transparency',
        communityId: 42,
      }),
    );
  });

  it('PATCH requires first-time acknowledgment before enabling', async () => {
    const res = await PATCH(
      makePatchRequest({
        communityId: 42,
        enabled: true,
        acknowledged: false,
      }),
    );

    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('PATCH rejects enablement when checklist is still uninitialized', async () => {
    ensureTransparencyChecklistInitializedMock.mockResolvedValueOnce([]);

    const res = await PATCH(
      makePatchRequest({
        communityId: 42,
        enabled: true,
        acknowledged: true,
      }),
    );

    expect(res.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });
});
