import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  logAuditEventMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  getNotificationPreferencesForUserMock,
  insertNotificationPreferencesMock,
  updateNotificationPreferencesMock,
  assertNotDemoGraceMock,
  tryAutoCompleteMock,
} = vi.hoisted(() => ({
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn().mockResolvedValue(undefined),
  getNotificationPreferencesForUserMock: vi.fn(),
  insertNotificationPreferencesMock: vi.fn().mockResolvedValue(undefined),
  updateNotificationPreferencesMock: vi.fn().mockResolvedValue(undefined),
  assertNotDemoGraceMock: vi.fn().mockResolvedValue(undefined),
  tryAutoCompleteMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
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

vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  tryAutoComplete: tryAutoCompleteMock,
}));

vi.mock('@/lib/services/notification-preferences-service', () => ({
  getNotificationPreferencesForUser: getNotificationPreferencesForUserMock,
  insertNotificationPreferences: insertNotificationPreferencesMock,
  updateNotificationPreferences: updateNotificationPreferencesMock,
}));

import { GET, PATCH } from '../../src/app/api/v1/notification-preferences/route';

describe('/api/v1/notification-preferences route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-123');
    getNotificationPreferencesForUserMock.mockResolvedValue(null);
  });

  it('GET returns defaults when no row exists', async () => {
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
        emailFrequency: 'immediate',
        calendarReminderPreset: '7_days_before',
        inAppEnabled: true,
      }),
    );
    expect(getNotificationPreferencesForUserMock).toHaveBeenCalledWith(42, 'user-123');
  });

  it('PATCH upserts preferences and writes audit log', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/notification-preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
        emailFrequency: 'never',
        inAppEnabled: true,
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Record<string, unknown> };
    expect(json.data).toEqual(
      expect.objectContaining({
        userId: 'user-123',
        communityId: 42,
        emailFrequency: 'never',
        inAppEnabled: true,
      }),
    );
    expect(insertNotificationPreferencesMock).toHaveBeenCalledWith(
      42,
      'user-123',
      expect.objectContaining({ emailFrequency: 'never', inAppEnabled: true }),
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

  it('PATCH logs IP, user-agent, and consent metadata for SMS preference changes', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/notification-preferences', {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': '203.0.113.5',
        'user-agent': 'PropertyProTest/1.0',
      },
      body: JSON.stringify({
        communityId: 42,
        smsEnabled: true,
        smsEmergencyOnly: true,
      }),
    });

    const res = await PATCH(req);
    expect(res.status).toBe(200);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          ip: '203.0.113.5',
          userAgent: 'PropertyProTest/1.0',
          consentMethod: 'web_form',
        },
      }),
    );
  });

  it('PATCH rejects invalid emailFrequency enum values', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/notification-preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        communityId: 42,
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
        inAppEnabled: true,
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

  it('PATCH rejects empty update payload', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/notification-preferences', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ communityId: 42 }),
    });
    const res = await PATCH(req);
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toBe('No preference updates provided');
  });
});
