import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  createScopedClientMock,
  logAuditEventMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  notificationPreferencesTable,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn().mockResolvedValue(undefined),
  notificationPreferencesTable: Symbol('notification_preferences'),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  notificationPreferences: notificationPreferencesTable,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col: unknown, value: unknown) => ({ col, value })),
}));

import { GET, PATCH } from '../../src/app/api/v1/notification-preferences/route';

describe('p1-26 notification-preferences route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-123');
  });

  it('GET returns defaults when no row exists', async () => {
    createScopedClientMock.mockReturnValue({
      query: vi.fn().mockResolvedValue([]),
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/notification-preferences?communityId=42',
    );
    const res = await GET(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        userId: 'user-123',
        communityId: 42,
        emailAnnouncements: true,
        emailDocuments: true,
        emailMeetings: true,
        emailMaintenance: true,
        emailFrequency: 'immediate',
      }),
    );
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-123');
  });

  it('PATCH upserts preferences with legacy payload and writes audit log', async () => {
    const stored: Record<string, unknown>[] = [];
    const query = vi.fn().mockImplementation(async () => stored);
    const insert = vi
      .fn()
      .mockImplementation(async (_table, data: Record<string, unknown>) => {
        stored.push({ id: 1, communityId: 42, ...data });
        return [stored[stored.length - 1]];
      });
    const update = vi
      .fn()
      .mockImplementation(async (_table, data: Record<string, unknown>) => {
        const idx = stored.findIndex((r) => r['userId'] === 'user-123');
        if (idx >= 0) stored[idx] = { ...stored[idx], ...data };
        return [stored[idx]];
      });

    createScopedClientMock.mockReturnValue({ query, insert, update });

    const req = new NextRequest('http://localhost:3000/api/v1/notification-preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        emailAnnouncements: false,
        emailDocuments: true,
        emailMeetings: true,
        emailMaintenance: false,
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);

    expect(stored[0]).toEqual(
      expect.objectContaining({
        userId: 'user-123',
        emailAnnouncements: false,
        emailDocuments: true,
        emailMeetings: true,
        emailMaintenance: false,
        emailFrequency: 'immediate',
      }),
    );

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings_changed',
        resourceType: 'notification_preferences',
        communityId: 42,
        userId: 'user-123',
      }),
    );
  });

  it('PATCH accepts explicit emailFrequency and returns it in response payload', async () => {
    const stored: Record<string, unknown>[] = [];
    const query = vi.fn().mockImplementation(async () => stored);
    const insert = vi
      .fn()
      .mockImplementation(async (_table, data: Record<string, unknown>) => {
        stored.push({ id: 1, communityId: 42, ...data });
        return [stored[stored.length - 1]];
      });

    createScopedClientMock.mockReturnValue({
      query,
      insert,
      update: vi.fn().mockResolvedValue([]),
    });

    const req = new NextRequest('http://localhost:3000/api/v1/notification-preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        emailAnnouncements: true,
        emailDocuments: true,
        emailMeetings: true,
        emailMaintenance: true,
        emailFrequency: 'weekly_digest',
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };

    expect(stored[0]?.['emailFrequency']).toBe('weekly_digest');
    expect(json.data['emailFrequency']).toBe('weekly_digest');
  });

  it('PATCH updates existing rows without dropping legacy preference fields', async () => {
    const stored: Record<string, unknown>[] = [{
      id: 1,
      userId: 'user-123',
      communityId: 42,
      emailAnnouncements: true,
      emailDocuments: false,
      emailMeetings: true,
      emailMaintenance: true,
      emailFrequency: 'daily_digest',
    }];
    const query = vi.fn().mockImplementation(async () => stored);
    const update = vi
      .fn()
      .mockImplementation(async (_table, data: Record<string, unknown>) => {
        stored[0] = { ...stored[0], ...data };
        return [stored[0]];
      });

    createScopedClientMock.mockReturnValue({
      query,
      insert: vi.fn().mockResolvedValue([]),
      update,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/notification-preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        emailAnnouncements: false,
        emailDocuments: true,
        emailMeetings: false,
        emailMaintenance: false,
        emailFrequency: 'never',
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      notificationPreferencesTable,
      expect.objectContaining({
        emailAnnouncements: false,
        emailDocuments: true,
        emailMeetings: false,
        emailMaintenance: false,
        emailFrequency: 'never',
      }),
      expect.any(Object),
    );
    expect(stored[0]).toEqual(
      expect.objectContaining({
        emailDocuments: true,
        emailMaintenance: false,
      }),
    );
  });

  it('PATCH rejects invalid emailFrequency enum values', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/notification-preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        emailAnnouncements: true,
        emailDocuments: true,
        emailMeetings: true,
        emailMaintenance: true,
        emailFrequency: 'monthly',
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(400);
  });

  it('PATCH returns 404 when x-community-id header conflicts with body communityId', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/notification-preferences', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-community-id': '99',
      },
      body: JSON.stringify({
        communityId: 42,
        emailAnnouncements: true,
        emailDocuments: true,
        emailMeetings: true,
        emailMaintenance: true,
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(404);
  });

  it('GET rejects unauthenticated requests', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest(
      'http://localhost:3000/api/v1/notification-preferences?communityId=42',
    );
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it('GET returns 403 for authenticated non-member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const req = new NextRequest(
      'http://localhost:3000/api/v1/notification-preferences?communityId=42',
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('PATCH rejects unauthenticated requests', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest('http://localhost:3000/api/v1/notification-preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        emailAnnouncements: true,
        emailDocuments: true,
        emailMeetings: true,
        emailMaintenance: true,
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(401);
  });

  it('PATCH returns 403 for authenticated non-member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const req = new NextRequest('http://localhost:3000/api/v1/notification-preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        emailAnnouncements: true,
        emailDocuments: true,
        emailMeetings: true,
        emailMaintenance: true,
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(403);
  });
});
