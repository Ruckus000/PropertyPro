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
      role: 'resident',
      isUnitOwner: true,
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

  /*
   * `featureKey` used to be `z.string().min(1).max(64)` while `requestedPlan`
   * one line below was strictly enumerated. A key naming no real feature
   * round-tripped silently, and the value reaches two sinks in the handler:
   * humanized into a notification body delivered to OTHER users, and
   * concatenated into the dedup `sourceId`. No authorization decision reads
   * it, so this is defence in depth rather than a closed vulnerability — but
   * the asymmetry is now gone.
   */
  it('rejects a featureKey that names no real feature', async () => {
    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ featureKey: 'hasContracts', requestedPlan: 'professional' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(400);
    // The request must not reach the notification path at all.
    expect(listBillingCapableUserIdsMock).not.toHaveBeenCalled();
    expect(insertNotificationsMock).not.toHaveBeenCalled();
  });

  it('rejects a featureKey carrying the sourceId delimiter', async () => {
    // `sourceId` is `${userId}:${featureKey}:${epochSeconds}`. The leading
    // segment is the requester's own unforgeable id, so a collision was never
    // reachable — but a caller-supplied ':' has no business getting that far.
    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ featureKey: 'a:b:c' }),
    });

    expect((await POST(req)).status).toBe(400);
  });

  it('still accepts a real feature key', async () => {
    // The control: without this, the two cases above would pass just as well
    // against a schema that rejected everything.
    const req = new NextRequest(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ featureKey: 'hasViolations', requestedPlan: 'professional' }),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(insertNotificationsMock).toHaveBeenCalled();
  });
});
