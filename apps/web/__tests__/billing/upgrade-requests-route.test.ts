import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  listBillingCapableUserIdsMock,
  insertNotificationsMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  listBillingCapableUserIdsMock: vi.fn(),
  insertNotificationsMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/services/billing-upgrade-requests-service', () => ({
  listBillingCapableUserIds: listBillingCapableUserIdsMock,
}));

vi.mock('@propertypro/db', () => ({
  insertNotifications: insertNotificationsMock,
}));

import { POST } from '../../src/app/api/v1/billing/upgrade-requests/route';

const URL = 'http://localhost:3000/api/v1/billing/upgrade-requests?communityId=1';

describe('POST /api/v1/billing/upgrade-requests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveEffectiveCommunityIdMock.mockReturnValue(1);
    requireAuthenticatedUserIdMock.mockResolvedValue('user-owner');
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'owner',
      isUnitOwner: true,
      presetKey: null,
      displayTitle: 'Jane Owner',
    });
    listBillingCapableUserIdsMock.mockResolvedValue(['billing-1', 'billing-2']);
    insertNotificationsMock.mockResolvedValue({ created: 2 });
  });

  it('notifies billing-capable users', async () => {
    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestedPlan: 'essentials' }),
    });
    const res = await POST(req);
    const json = (await res.json()) as { data: { ok: boolean; notified: number } };

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ ok: true, notified: 2 });
    expect(insertNotificationsMock).toHaveBeenCalled();
  });

  it('returns notified: 0 when no recipients', async () => {
    listBillingCapableUserIdsMock.mockResolvedValueOnce([]);

    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    const json = (await res.json()) as { data: { ok: boolean; notified: number } };

    expect(res.status).toBe(200);
    expect(json.data).toEqual({ ok: true, notified: 0 });
    expect(insertNotificationsMock).not.toHaveBeenCalled();
  });

  it('returns 403 for tenants', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      role: 'resident',
      isUnitOwner: false,
      presetKey: null,
    });

    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    const res = await POST(req);

    expect(res.status).toBe(403);
    expect(listBillingCapableUserIdsMock).not.toHaveBeenCalled();
  });
});
