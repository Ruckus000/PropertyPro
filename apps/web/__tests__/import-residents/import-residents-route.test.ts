/**
 * Route unit tests — `POST /api/v1/import-residents`.
 *
 * Added alongside the Plan A1 auto-drain to runRoute. Covers the contracted
 * envelope: dryRun preview, real-import happy path (single row → user + role +
 * prefs + audit), import with omitted optional `dryRun` (defaults to false),
 * 401 unauth, 400 body-validation (missing csv / missing communityId /
 * non-boolean dryRun), 403 demo-grace (before membership/permission), 403
 * non-member, 403 permission denied, and the per-row skip paths
 * (unit-not-found, duplicate role).
 *
 * Note: this route has NO `[id]` path param — `communityId` arrives in the
 * body — so the canonical "params.id = 'abc' vs '0'" cases do not apply here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  logAuditEventMock,
  validateResidentCsvMock,
  validateRoleAssignmentMock,
  listCommunitiesForUserMock,
  getCommunityTypeForOnboardingMock,
  loadUnitNumberMapForImportMock,
  loadUserEmailMapForImportMock,
  loadUsersWithExistingRoleForImportMock,
  insertUserForImportMock,
  insertUserRoleForImportMock,
  insertNotificationPreferencesForImportMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  validateResidentCsvMock: vi.fn(),
  validateRoleAssignmentMock: vi.fn(),
  listCommunitiesForUserMock: vi.fn(),
  getCommunityTypeForOnboardingMock: vi.fn(),
  loadUnitNumberMapForImportMock: vi.fn(),
  loadUserEmailMapForImportMock: vi.fn(),
  loadUsersWithExistingRoleForImportMock: vi.fn(),
  insertUserForImportMock: vi.fn(),
  insertUserRoleForImportMock: vi.fn(),
  insertNotificationPreferencesForImportMock: vi.fn(),
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

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/utils/csv-validator', () => ({
  RESIDENT_IMPORT_ROLES: ['owner', 'tenant'] as const,
  validateResidentCsv: validateResidentCsvMock,
}));

vi.mock('@/lib/utils/role-validator', async () => {
  const actual = await vi.importActual<typeof import('../../src/lib/utils/role-validator')>(
    '../../src/lib/utils/role-validator',
  );
  return {
    // Real tier check — the lockdown tests exercise the actual guard.
    isResidentTierRole: actual.isResidentTierRole,
    validateRoleAssignment: validateRoleAssignmentMock,
  };
});

vi.mock('@/lib/api/user-communities', () => ({
  listCommunitiesForUser: listCommunitiesForUserMock,
}));

vi.mock('@/lib/services/onboarding-service', () => ({
  getCommunityTypeForOnboarding: getCommunityTypeForOnboardingMock,
}));

vi.mock('@/lib/services/import-residents-service', () => ({
  loadUnitNumberMapForImport: loadUnitNumberMapForImportMock,
  loadUserEmailMapForImport: loadUserEmailMapForImportMock,
  loadUsersWithExistingRoleForImport: loadUsersWithExistingRoleForImportMock,
  insertUserForImport: insertUserForImportMock,
  insertUserRoleForImport: insertUserRoleForImportMock,
  insertNotificationPreferencesForImport: insertNotificationPreferencesForImportMock,
}));

import { POST } from '../../src/app/api/v1/import-residents/route';

const ADMIN_MEMBERSHIP = {
  userId: 'actor-1',
  communityId: 42,
  role: 'cam' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'CAM',
  communityType: 'condo_718' as const,
};

function emptyCsvResult() {
  return { header: ['name', 'email', 'role', 'unit_number'], rows: [], errors: [] };
}

function jsonPost(payload: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/import-residents', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

describe('POST /api/v1/import-residents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('actor-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requirePermissionMock.mockReturnValue(undefined);
    validateResidentCsvMock.mockReturnValue(emptyCsvResult());
    validateRoleAssignmentMock.mockReturnValue({ valid: true });
    listCommunitiesForUserMock.mockResolvedValue([]);
    getCommunityTypeForOnboardingMock.mockResolvedValue('condo_718');
    loadUnitNumberMapForImportMock.mockResolvedValue(new Map());
    loadUserEmailMapForImportMock.mockResolvedValue(new Map());
    loadUsersWithExistingRoleForImportMock.mockResolvedValue(new Set());
    insertUserForImportMock.mockResolvedValue('new-user-1');
    insertUserRoleForImportMock.mockResolvedValue(undefined);
    insertNotificationPreferencesForImportMock.mockResolvedValue(undefined);
    logAuditEventMock.mockResolvedValue(undefined);
  });

  it('returns a dryRun preview without importing (happy path)', async () => {
    validateResidentCsvMock.mockReturnValueOnce({
      header: ['name', 'email', 'role', 'unit_number'],
      rows: [
        { rowNumber: 2, data: { name: 'Ada', email: 'ada@x.com', role: 'owner', unit_number: '101' } },
      ],
      errors: [],
    });

    const res = await POST(jsonPost({ communityId: 42, csv: 'header\nrow', dryRun: true }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { preview: unknown[]; errors: unknown[]; header: string[] };
    };
    expect(json.data.preview).toHaveLength(1);
    expect(json.data.header).toEqual(['name', 'email', 'role', 'unit_number']);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'actor-1');
    expect(requirePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP, 'residents', 'write');
    // No import side-effects on a dry run.
    expect(insertUserForImportMock).not.toHaveBeenCalled();
    expect(getCommunityTypeForOnboardingMock).not.toHaveBeenCalled();
  });

  it('imports a single new owner row end-to-end (creates user + role + prefs + audit)', async () => {
    validateResidentCsvMock.mockReturnValueOnce({
      header: ['name', 'email', 'role', 'unit_number'],
      rows: [
        { rowNumber: 2, data: { name: 'Ada', email: 'ada@x.com', role: 'owner', unit_number: '101' } },
      ],
      errors: [],
    });
    loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map([['101', 7]]));

    const res = await POST(jsonPost({ communityId: 42, csv: 'header\nrow', dryRun: false }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { importedCount: number; skippedCount: number; errors: unknown[] };
    };
    expect(json.data.importedCount).toBe(1);
    expect(json.data.skippedCount).toBe(0);
    expect(json.data.errors).toEqual([]);
    expect(insertUserForImportMock).toHaveBeenCalledWith(42, {
      id: expect.any(String),
      email: 'ada@x.com',
      fullName: 'Ada',
    });
    expect(insertUserRoleForImportMock).toHaveBeenCalledWith(42, {
      userId: 'new-user-1',
      role: 'resident',
      unitId: 7,
      isUnitOwner: true,
      displayTitle: 'Owner',
    });
    expect(insertNotificationPreferencesForImportMock).toHaveBeenCalledWith(42, 'new-user-1');
    expect(logAuditEventMock).toHaveBeenCalledTimes(1);
  });

  // Note: pre-lockdown this suite had "writes designation in lockstep" tests for
  // board_member/cam CSV rows (Phase 3.2, #730). Role-v3 invariant 3 removes the
  // import path's ability to mint manager-tier rows entirely, so those rows are
  // now rejected — see the "manager-tier lockdown" describe block below, which
  // asserts board_member/cam/etc. are skipped with a role error and never inserted.

  it('defaults dryRun to false when omitted (runs the real import path)', async () => {
    const res = await POST(jsonPost({ communityId: 42, csv: 'header-only' }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { importedCount: number; skippedCount: number };
    };
    expect(json.data.importedCount).toBe(0);
    // Real-import path loads community type (dryRun short-circuits before this).
    expect(getCommunityTypeForOnboardingMock).toHaveBeenCalledWith(42);
  });

  // -------------------------------------------------------------------------
  // Security regression — manager-tier lockdown (role-v3 invariant 3).
  // The CSV validator is MOCKED here, simulating a validator bypass/drift that
  // lets a manager-tier legacy role through. The route-level guard must still
  // reject the row before any user/role insert — only root mints
  // property_manager; the import path can never write a manager-tier role.
  // -------------------------------------------------------------------------
  describe('manager-tier lockdown (route-level guard, validator bypassed)', () => {
    it.each(['board_president', 'board_member', 'cam', 'site_manager', 'property_manager_admin', 'manager', 'pm_admin'])(
      'skips a %s row with a role error and writes nothing',
      async (role) => {
        validateResidentCsvMock.mockReturnValueOnce({
          header: ['name', 'email', 'role', 'unit_number'],
          rows: [
            { rowNumber: 2, data: { name: 'Eve', email: 'eve@x.com', role, unit_number: '' } },
          ],
          errors: [],
        });

        const res = await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: false }));

        expect(res.status).toBe(200);
        const json = (await res.json()) as {
          data: { importedCount: number; skippedCount: number; errors: Array<{ column: string | null; message: string }> };
        };
        expect(json.data.importedCount).toBe(0);
        expect(json.data.skippedCount).toBe(1);
        expect(json.data.errors[0]?.column).toBe('role');
        expect(json.data.errors[0]?.message).toContain('cannot be imported');
        // No user row and — critically — no role row with a permissions JSONB.
        expect(insertUserForImportMock).not.toHaveBeenCalled();
        expect(insertUserRoleForImportMock).not.toHaveBeenCalled();
      },
    );
  });

  it('skips a row whose unit_number is not found (counts toward skippedCount)', async () => {
    validateResidentCsvMock.mockReturnValueOnce({
      header: ['name', 'email', 'role', 'unit_number'],
      rows: [
        { rowNumber: 2, data: { name: 'Bo', email: 'bo@x.com', role: 'owner', unit_number: '999' } },
      ],
      errors: [],
    });
    loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map());

    const res = await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: false }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { importedCount: number; skippedCount: number; errors: Array<{ message: string }> };
    };
    expect(json.data.importedCount).toBe(0);
    expect(json.data.skippedCount).toBe(1);
    expect(json.data.errors[0]?.message).toBe("Unit '999' not found");
    expect(insertUserForImportMock).not.toHaveBeenCalled();
  });

  it('skips a row whose user already has a role in this community', async () => {
    validateResidentCsvMock.mockReturnValueOnce({
      header: ['name', 'email', 'role', 'unit_number'],
      rows: [
        { rowNumber: 2, data: { name: 'Cy', email: 'cy@x.com', role: 'owner', unit_number: '' } },
      ],
      errors: [],
    });
    loadUserEmailMapForImportMock.mockResolvedValueOnce(new Map([['cy@x.com', 'existing-1']]));
    loadUsersWithExistingRoleForImportMock.mockResolvedValueOnce(new Set(['existing-1']));

    const res = await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: false }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { importedCount: number; skippedCount: number; errors: Array<{ message: string }> };
    };
    expect(json.data.importedCount).toBe(0);
    expect(json.data.skippedCount).toBe(1);
    expect(json.data.errors[0]?.message).toBe(
      "User with email 'cy@x.com' already has a role in this community",
    );
    expect(insertUserRoleForImportMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(jsonPost({ communityId: 42, csv: 'c' }));

    expect(res.status).toBe(401);
    expect(validateResidentCsvMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when csv is missing', async () => {
    const res = await POST(jsonPost({ communityId: 42 }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when csv is an empty string', async () => {
    const res = await POST(jsonPost({ communityId: 42, csv: '' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when communityId is missing', async () => {
    const res = await POST(jsonPost({ csv: 'c' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 400 VALIDATION_ERROR when dryRun is not a boolean', async () => {
    const res = await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: 'yes' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 403 during the demo grace window (before membership/permission checks run)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(jsonPost({ communityId: 42, csv: 'c' }));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(validateResidentCsvMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(jsonPost({ communityId: 42, csv: 'c' }));

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(validateResidentCsvMock).not.toHaveBeenCalled();
  });

  it('returns 403 when residents.write permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(jsonPost({ communityId: 42, csv: 'c' }));

    expect(res.status).toBe(403);
    expect(validateResidentCsvMock).not.toHaveBeenCalled();
  });
});
