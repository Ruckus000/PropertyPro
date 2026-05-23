/**
 * Route unit tests — `/api/v1/transparency/settings` (GET + PATCH).
 *
 * Extended for Plan A1 drain #16. The pre-existing 7 cases (real
 * `requirePermission` + real `getFeaturesForCommunity` via mocked
 * membership) are preserved verbatim. The drain adds explicit coverage of:
 *   - 401 unauthenticated (both GET and PATCH)
 *   - GET 400 missing / non-positive communityId
 *   - GET 404 settings === null (community not found)
 *   - PATCH 403 demo-grace short-circuits before membership check
 *   - PATCH happy-path with FULL audit-log payload assertion (old + new ISO)
 *   - PATCH happy-path: re-enabling when already acknowledged (no
 *     acknowledged required, no new acknowledgedAt stamp)
 *   - PATCH happy-path: disabling (checklist NOT initialized, acknowledged
 *     check skipped)
 *   - PATCH 400 missing communityId
 *   - PATCH 400 `.strict()` rejects extra fields (runner enforces)
 *   - PATCH 404 community not found
 *
 * The drain #16 cases use a separate `vi.mock('@/lib/db/access-control', ...)`
 * to mock `requirePermission` directly when needed (matches drain #13 style).
 * The pre-existing cases continue to use real `requirePermission` driven by
 * the mocked membership's `permissions` map.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  logAuditEventMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  ensureTransparencyChecklistInitializedMock,
  getTransparencySettingsMock,
  setTransparencySettingsMock,
  assertNotDemoGraceMock,
} = vi.hoisted(() => ({
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  ensureTransparencyChecklistInitializedMock: vi.fn(),
  getTransparencySettingsMock: vi.fn(),
  setTransparencySettingsMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn().mockResolvedValue(undefined),
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

vi.mock('@/lib/services/transparency-service', () => ({
  ensureTransparencyChecklistInitialized: ensureTransparencyChecklistInitializedMock,
  getTransparencySettings: getTransparencySettingsMock,
  setTransparencySettings: setTransparencySettingsMock,
}));


vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
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

const FULL_PERMS = {
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
};

describe('transparency settings route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    assertNotDemoGraceMock.mockResolvedValue(undefined);

    requireAuthenticatedUserIdMock.mockResolvedValue('user-123');
    requireCommunityMembershipMock.mockResolvedValue({
      userId: 'user-123',
      communityId: 42,
      role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board President', presetKey: 'board_president', permissions: FULL_PERMS,
      communityType: 'condo_718',
    });

    getTransparencySettingsMock.mockResolvedValue({
      enabled: false,
      acknowledgedAt: null,
    });
    setTransparencySettingsMock.mockResolvedValue(undefined);

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
      role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board Member', presetKey: 'board_member', permissions: FULL_PERMS,
      communityType: 'condo_718',
    });

    getTransparencySettingsMock.mockResolvedValueOnce({
      enabled: true,
      acknowledgedAt: new Date('2026-03-07T12:00:00.000Z'),
    });

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
      role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Site Manager', presetKey: 'site_manager', permissions: FULL_PERMS,
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

  it('GET returns 200 with acknowledgedAt:null when never acknowledged', async () => {
    getTransparencySettingsMock.mockResolvedValueOnce({
      enabled: false,
      acknowledgedAt: null,
    });

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/transparency/settings?communityId=42'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { enabled: boolean; acknowledgedAt: string | null };
    };
    expect(json.data).toEqual({ enabled: false, acknowledgedAt: null });
  });

  it('GET returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/transparency/settings?communityId=42'),
    );

    expect(res.status).toBe(401);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(getTransparencySettingsMock).not.toHaveBeenCalled();
  });

  it('GET returns 400 when communityId query param is missing', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/transparency/settings'),
    );

    expect(res.status).toBe(400);
    expect(getTransparencySettingsMock).not.toHaveBeenCalled();
  });

  it('GET returns 400 when communityId is non-positive', async () => {
    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/transparency/settings?communityId=0'),
    );

    expect(res.status).toBe(400);
    expect(getTransparencySettingsMock).not.toHaveBeenCalled();
  });

  it('GET returns 404 when community is not found (getTransparencySettings returns null)', async () => {
    getTransparencySettingsMock.mockResolvedValueOnce(null);

    const res = await GET(
      new NextRequest('http://localhost:3000/api/v1/transparency/settings?communityId=42'),
    );

    expect(res.status).toBe(404);
  });

  it('PATCH denies board_member write access', async () => {
    // board_member has settings.write = false in the RBAC matrix
    requireCommunityMembershipMock.mockResolvedValueOnce({
      userId: 'user-123',
      communityId: 42,
      role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Board Member', presetKey: 'board_member', permissions: { resources: { ...FULL_PERMS.resources, settings: { read: true, write: false }, audit: { read: true, write: false } } },
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
    expect(setTransparencySettingsMock).not.toHaveBeenCalled();
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
    expect(setTransparencySettingsMock).toHaveBeenCalledWith(
      42,
      expect.objectContaining({ enabled: true }),
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings_changed',
        resourceType: 'transparency',
        communityId: 42,
      }),
    );
  });

  it('PATCH enables transparency: full audit-log payload with ISO-string old + new acknowledgedAt', async () => {
    // Lock the freshly stamped acknowledgedAt to a known value so we can
    // assert the exact ISO string in the audit log.
    const fakeNow = new Date('2026-05-23T10:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(fakeNow);

    try {
      const res = await PATCH(
        makePatchRequest({
          communityId: 42,
          enabled: true,
          acknowledged: true,
        }),
      );

      expect(res.status).toBe(200);
      const json = (await res.json()) as {
        data: { enabled: boolean; acknowledgedAt: string | null };
      };
      expect(json.data).toEqual({
        enabled: true,
        acknowledgedAt: '2026-05-23T10:00:00.000Z',
      });

      // setTransparencySettings called with the fresh Date (not ISO)
      expect(setTransparencySettingsMock).toHaveBeenCalledWith(42, {
        enabled: true,
        acknowledgedAt: fakeNow,
      });

      // Full audit-log payload: old (null) + new (ISO of fakeNow)
      expect(logAuditEventMock).toHaveBeenCalledWith({
        userId: 'user-123',
        action: 'settings_changed',
        resourceType: 'transparency',
        resourceId: '42',
        communityId: 42,
        oldValues: { enabled: false, acknowledgedAt: null },
        newValues: { enabled: true, acknowledgedAt: '2026-05-23T10:00:00.000Z' },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('PATCH re-enables when already acknowledged: no acknowledged flag required, no new stamp', async () => {
    const priorAck = new Date('2026-01-15T09:30:00.000Z');
    getTransparencySettingsMock.mockResolvedValueOnce({
      enabled: false, // was disabled, now re-enabling
      acknowledgedAt: priorAck,
    });

    const res = await PATCH(
      makePatchRequest({
        communityId: 42,
        enabled: true,
        // NOTE: no `acknowledged` field — required only on first enable
      }),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { enabled: boolean; acknowledgedAt: string | null };
    };
    expect(json.data).toEqual({
      enabled: true,
      acknowledgedAt: '2026-01-15T09:30:00.000Z',
    });
    // The prior Date is reused — not a fresh stamp.
    expect(setTransparencySettingsMock).toHaveBeenCalledWith(42, {
      enabled: true,
      acknowledgedAt: priorAck,
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: { enabled: false, acknowledgedAt: '2026-01-15T09:30:00.000Z' },
        newValues: { enabled: true, acknowledgedAt: '2026-01-15T09:30:00.000Z' },
      }),
    );
  });

  it('PATCH disable path: skips checklist init and acknowledged checks', async () => {
    // Previously enabled+acknowledged; user is now disabling.
    const priorAck = new Date('2026-01-15T09:30:00.000Z');
    getTransparencySettingsMock.mockResolvedValueOnce({
      enabled: true,
      acknowledgedAt: priorAck,
    });

    const res = await PATCH(
      makePatchRequest({
        communityId: 42,
        enabled: false,
      }),
    );

    expect(res.status).toBe(200);
    // Critical: checklist init MUST NOT be called when disabling.
    expect(ensureTransparencyChecklistInitializedMock).not.toHaveBeenCalled();
    expect(setTransparencySettingsMock).toHaveBeenCalledWith(42, {
      enabled: false,
      acknowledgedAt: priorAck,
    });
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: { enabled: true, acknowledgedAt: '2026-01-15T09:30:00.000Z' },
        newValues: { enabled: false, acknowledgedAt: '2026-01-15T09:30:00.000Z' },
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
    expect(setTransparencySettingsMock).not.toHaveBeenCalled();
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
    expect(setTransparencySettingsMock).not.toHaveBeenCalled();
  });

  it('PATCH returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(
      makePatchRequest({ communityId: 42, enabled: true, acknowledged: true }),
    );

    expect(res.status).toBe(401);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(setTransparencySettingsMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('PATCH returns 403 during demo-grace window (before membership check)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await PATCH(
      makePatchRequest({ communityId: 42, enabled: true, acknowledged: true }),
    );

    expect(res.status).toBe(403);
    // assertNotDemoGrace runs BEFORE the membership check — verify ordering.
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(setTransparencySettingsMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('PATCH returns 404 when transparency is unavailable for community type', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      userId: 'user-123',
      communityId: 42,
      role: 'manager', isAdmin: true, isUnitOwner: false, displayTitle: 'Site Manager', presetKey: 'site_manager', permissions: FULL_PERMS,
      communityType: 'apartment',
    });

    const res = await PATCH(
      makePatchRequest({ communityId: 42, enabled: true, acknowledged: true }),
    );

    expect(res.status).toBe(404);
    expect(setTransparencySettingsMock).not.toHaveBeenCalled();
  });

  it('PATCH returns 404 when community is not found', async () => {
    getTransparencySettingsMock.mockResolvedValueOnce(null);

    const res = await PATCH(
      makePatchRequest({ communityId: 42, enabled: true, acknowledged: true }),
    );

    expect(res.status).toBe(404);
    expect(setTransparencySettingsMock).not.toHaveBeenCalled();
  });

  it('PATCH returns 400 when communityId is missing from body', async () => {
    const res = await PATCH(
      makePatchRequest({ enabled: true, acknowledged: true } as unknown as Record<string, unknown>),
    );

    expect(res.status).toBe(400);
    expect(setTransparencySettingsMock).not.toHaveBeenCalled();
  });

  it('PATCH .strict() rejects extra fields with 400', async () => {
    const res = await PATCH(
      makePatchRequest({
        communityId: 42,
        enabled: true,
        acknowledged: true,
        extraField: 'should-be-rejected',
      }),
    );

    expect(res.status).toBe(400);
    expect(setTransparencySettingsMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('PATCH returns 404 when x-community-id header disagrees with body', async () => {
    const res = await PATCH(
      makePatchRequest(
        { communityId: 42, enabled: true, acknowledged: true },
        { 'x-community-id': '99' },
      ),
    );

    expect(res.status).toBe(404);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(setTransparencySettingsMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});
