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
  importResidentRowMock,
  captureExceptionMock,
  assertActorMayAttachExistingUserMock,
  loadActorCommunitiesForLinkingMock,
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
  importResidentRowMock: vi.fn(),
  captureExceptionMock: vi.fn(),
  assertActorMayAttachExistingUserMock: vi.fn(),
  loadActorCommunitiesForLinkingMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', async () => ({
  ...(await vi.importActual<typeof import('@sentry/nextjs')>('@sentry/nextjs')),
  captureException: captureExceptionMock,
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

// The cross-tenant guard runs for every row whose email matched a PRE-EXISTING
// platform user. Its own logic is unit-tested in __tests__/services/user-linking.test.ts;
// here we only care that this route calls it and soft-fails the row it rejects.
vi.mock('@/lib/services/user-linking', () => ({
  assertActorMayAttachExistingUser: assertActorMayAttachExistingUserMock,
  loadActorCommunitiesForLinking: loadActorCommunitiesForLinkingMock,
}));

vi.mock('@/lib/services/import-residents-service', () => ({
  loadUnitNumberMapForImport: loadUnitNumberMapForImportMock,
  loadUserEmailMapForImport: loadUserEmailMapForImportMock,
  loadUsersWithExistingRoleForImport: loadUsersWithExistingRoleForImportMock,
  importResidentRow: importResidentRowMock,
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
    assertActorMayAttachExistingUserMock.mockResolvedValue(undefined);
    loadActorCommunitiesForLinkingMock.mockResolvedValue([{ communityId: 42 }]);
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
    importResidentRowMock.mockResolvedValue('new-user-1');
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
    loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map([['101', 7]]));

    const res = await POST(jsonPost({ communityId: 42, csv: 'header\nrow', dryRun: true }));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { preview: unknown[]; errors: unknown[]; header: string[] };
    };
    expect(json.data.preview).toEqual([
      { name: 'Ada', email: 'ada@x.com', role: 'owner', unit_number: '101', rowNumber: 2, existingAccount: false },
    ]);
    expect(json.data.header).toEqual(['name', 'email', 'role', 'unit_number']);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'actor-1');
    expect(requirePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP, 'residents', 'write');
    // No import side-effects on a dry run.
    expect(importResidentRowMock).not.toHaveBeenCalled();
    // Until onboarding audit F1 this asserted the preview never loaded the
    // community at all — which is exactly why it could not predict the import.
    expect(getCommunityTypeForOnboardingMock).toHaveBeenCalledWith(42);
  });

  // -------------------------------------------------------------------------
  // Onboarding audit F1: the preview must report what the import will do.
  // Each case runs the SAME fixture through dryRun and through the import, and
  // asserts the preview refuses exactly the rows the import skips.
  // -------------------------------------------------------------------------
  describe('preview predicts the import (audit F1)', () => {
    type PreviewJson = {
      data: {
        preview: Array<{ email: string; rowNumber: number; existingAccount: boolean }>;
        errors: Array<{ rowNumber: number; column: string | null; message: string }>;
      };
    };
    type ImportJson = {
      data: {
        importedCount: number;
        skippedCount: number;
        errors: Array<{ rowNumber: number; column: string | null; message: string }>;
      };
    };

    const rows = (...entries: Array<[number, string, string, string]>) => ({
      header: ['name', 'email', 'role', 'unit_number'],
      rows: entries.map(([rowNumber, email, role, unit]) => ({
        rowNumber,
        data: { name: email.split('@')[0]!, email, role, unit_number: unit || null },
      })),
      errors: [],
    });

    async function previewAndImport(setup: () => void) {
      setup();
      const preview = (await (await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: true }))).json()) as PreviewJson;
      setup();
      const imported = (await (await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: false }))).json()) as ImportJson;
      return { preview: preview.data, imported: imported.data };
    }

    it.each([
      {
        name: 'a unit that does not exist',
        setup: () => {
          validateResidentCsvMock.mockReturnValueOnce(rows([2, 'bo@x.com', 'owner', '999']));
          loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map([['101', 7]]));
        },
        error: { rowNumber: 2, column: 'unit_number', message: "Unit '999' not found" },
      },
      {
        name: 'an owner in an apartment community',
        setup: () => {
          validateResidentCsvMock.mockReturnValueOnce(rows([2, 'ow@x.com', 'owner', '101']));
          getCommunityTypeForOnboardingMock.mockResolvedValueOnce('apartment');
          loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map([['101', 7]]));
        },
        error: { rowNumber: 2, column: 'role', message: "Role 'owner' is not allowed for apartment communities." },
      },
      {
        name: 'a person who is already a member',
        setup: () => {
          validateResidentCsvMock.mockReturnValueOnce(rows([2, 'cy@x.com', 'owner', '101']));
          loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map([['101', 7]]));
          loadUserEmailMapForImportMock.mockResolvedValueOnce(new Map([['cy@x.com', 'existing-1']]));
          loadUsersWithExistingRoleForImportMock.mockResolvedValueOnce(new Set(['existing-1']));
        },
        error: {
          rowNumber: 2,
          column: 'email',
          message: "User with email 'cy@x.com' already has a role in this community",
          // Tagged so the preview can show it as done, not as a problem to fix.
          code: 'already_member',
        },
      },
      {
        name: 'an existing account the manager cannot already see',
        setup: () => {
          validateResidentCsvMock.mockReturnValueOnce(rows([2, 'victim@other.example.com', 'owner', '101']));
          loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map([['101', 7]]));
          loadUserEmailMapForImportMock.mockResolvedValueOnce(new Map([['victim@other.example.com', 'stranger-1']]));
          assertActorMayAttachExistingUserMock.mockRejectedValueOnce(new ForbiddenError('nope'));
        },
        error: {
          rowNumber: 2,
          column: 'email',
          message: "'victim@other.example.com' belongs to an existing account you cannot already see",
        },
      },
      {
        name: 'a tenant who is already a tenant elsewhere',
        setup: () => {
          validateResidentCsvMock.mockReturnValueOnce(rows([2, 'te@x.com', 'tenant', '101']));
          loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map([['101', 7]]));
          loadUserEmailMapForImportMock.mockResolvedValueOnce(new Map([['te@x.com', 'tenant-1']]));
          listCommunitiesForUserMock.mockResolvedValueOnce([
            { communityId: 99, role: 'resident', isUnitOwner: false },
          ]);
        },
        error: { rowNumber: 2, column: 'role', message: "Tenant 'te@x.com' already belongs to another community" },
      },
    ])('refuses $name in the preview, exactly as the import does', async ({ setup, error }) => {
      const { preview, imported } = await previewAndImport(setup);

      expect(preview.preview).toEqual([]);
      expect(preview.errors).toEqual([error]);
      expect(imported.importedCount).toBe(0);
      expect(imported.skippedCount).toBe(1);
      expect(imported.errors).toEqual([error]);
      expect(importResidentRowMock).not.toHaveBeenCalled();
    });

    it('keeps each row on its own source line number through a mixed file', async () => {
      validateResidentCsvMock.mockReturnValueOnce({
        header: ['name', 'email', 'role', 'unit_number'],
        rows: [
          { rowNumber: 3, data: { name: 'Ok', email: 'ok@x.com', role: 'owner', unit_number: '101' } },
          { rowNumber: 5, data: { name: 'No', email: 'no@x.com', role: 'owner', unit_number: '999' } },
          { rowNumber: 6, data: { name: 'Back', email: 'back@x.com', role: 'owner', unit_number: '101' } },
        ],
        // Line 2 failed the shape checks; line 4 was blank.
        errors: [{ rowNumber: 2, column: 'email', message: 'Invalid email address' }],
      });
      loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map([['101', 7]]));
      loadUserEmailMapForImportMock.mockResolvedValueOnce(new Map([['back@x.com', 'returning-1']]));

      const res = await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: true }));
      const json = (await res.json()) as PreviewJson;

      expect(json.data.preview.map((r) => [r.rowNumber, r.email, r.existingAccount])).toEqual([
        [3, 'ok@x.com', false],
        [6, 'back@x.com', true],
      ]);
      expect(json.data.errors.map((e) => e.rowNumber)).toEqual([2, 5]);
    });

    it('re-checks at import time instead of trusting the preview', async () => {
      // Previewed while unit 101 existed…
      validateResidentCsvMock.mockReturnValueOnce(rows([2, 'ada@x.com', 'owner', '101']));
      loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map([['101', 7]]));
      const preview = (await (await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: true }))).json()) as PreviewJson;
      expect(preview.data.preview).toHaveLength(1);

      // …and imported after it was deleted.
      validateResidentCsvMock.mockReturnValueOnce(rows([2, 'ada@x.com', 'owner', '101']));
      loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map());
      const imported = (await (await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: false }))).json()) as ImportJson;

      expect(imported.data.importedCount).toBe(0);
      expect(imported.data.errors).toEqual([
        { rowNumber: 2, column: 'unit_number', message: "Unit '101' not found" },
      ]);
      expect(importResidentRowMock).not.toHaveBeenCalled();
    });

    it('attaches an existing account it may see without creating a second user', async () => {
      validateResidentCsvMock.mockReturnValueOnce(rows([2, 'back@x.com', 'owner', '101']));
      loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map([['101', 7]]));
      loadUserEmailMapForImportMock.mockResolvedValueOnce(new Map([['back@x.com', 'returning-1']]));

      const res = await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: false }));
      const json = (await res.json()) as ImportJson;

      expect(json.data.importedCount).toBe(1);
      // The existing account is attached, never a second user created.
      expect(importResidentRowMock).toHaveBeenCalledWith(
        expect.objectContaining({ existingUserId: 'returning-1', unitId: 7 }),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Onboarding audit F2: each row is its own transaction. A row that fails has
  // written nothing (proven on real Postgres in
  // __tests__/integration/import-residents-atomicity.integration.test.ts); here
  // we pin that the route reports it and carries on.
  // -------------------------------------------------------------------------
  describe('row writes (audit F2)', () => {
    const threeRows = () =>
      validateResidentCsvMock.mockReturnValueOnce({
        header: ['name', 'email', 'role', 'unit_number'],
        rows: [
          { rowNumber: 2, data: { name: 'A', email: 'a@x.com', role: 'owner', unit_number: '101' } },
          { rowNumber: 3, data: { name: 'B', email: 'b@x.com', role: 'owner', unit_number: '101' } },
          { rowNumber: 4, data: { name: 'C', email: 'c@x.com', role: 'owner', unit_number: '101' } },
        ],
        errors: [],
      });

    type ImportJson = {
      data: {
        importedCount: number;
        skippedCount: number;
        errors: Array<{ rowNumber: number; column: string | null; message: string }>;
      };
    };

    it('a row that fails is reported and the rows after it still import', async () => {
      threeRows();
      loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map([['101', 7]]));
      importResidentRowMock
        .mockResolvedValueOnce('u-a')
        .mockRejectedValueOnce(new Error('connection reset'))
        .mockResolvedValueOnce('u-c');

      const res = await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: false }));
      const json = (await res.json()) as ImportJson;

      expect(res.status).toBe(200);
      expect(importResidentRowMock).toHaveBeenCalledTimes(3);
      expect(json.data.importedCount).toBe(2);
      expect(json.data.skippedCount).toBe(1);
      expect(json.data.errors).toEqual([
        {
          rowNumber: 3,
          column: null,
          message: "We couldn't import this row, and nothing was saved for it. Please try it again.",
        },
      ]);
      // An unexpected failure is reported, with no row contents attached.
      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
      expect(captureExceptionMock).toHaveBeenCalledWith(expect.any(Error), {
        tags: { route: 'import-residents', phase: 'row-write' },
        extra: { communityId: 42, rowNumber: 3 },
      });
      // Every row's audit says how big the import was, even though the final
      // count is not known inside a row's transaction.
      for (const [arg] of importResidentRowMock.mock.calls) {
        expect(arg).toEqual(expect.objectContaining({ bulkCount: 3 }));
      }
    });

    it('does not call any other unique violation a race (it would fail the same way on every upload)', async () => {
      threeRows();
      loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map([['101', 7]]));
      const notARace = Object.assign(new Error('Failed query'), {
        cause: Object.assign(new Error('duplicate key'), { code: '23505', constraint_name: 'users_email_unique' }),
      });
      importResidentRowMock
        .mockResolvedValueOnce('u-a')
        .mockRejectedValueOnce(notARace)
        .mockResolvedValueOnce('u-c');

      const json = (await (await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: false }))).json()) as ImportJson;

      expect(json.data.errors).toEqual([
        {
          rowNumber: 3,
          column: null,
          message: "We couldn't import this row, and nothing was saved for it. Please try it again.",
        },
      ]);
      expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    });

    it('stops after five unexpected failures in a row and says which rows were not tried', async () => {
      validateResidentCsvMock.mockReturnValueOnce({
        header: ['name', 'email', 'role', 'unit_number'],
        rows: Array.from({ length: 7 }, (_, i) => ({
          rowNumber: i + 2,
          data: { name: `P${i}`, email: `p${i}@x.com`, role: 'owner', unit_number: '101' },
        })),
        errors: [],
      });
      loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map([['101', 7]]));
      importResidentRowMock.mockRejectedValue(new Error('pool exhausted'));

      const json = (await (await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: false }))).json()) as ImportJson;

      expect(importResidentRowMock).toHaveBeenCalledTimes(5);
      expect(captureExceptionMock).toHaveBeenCalledTimes(5);
      expect(json.data.importedCount).toBe(0);
      expect(json.data.skippedCount).toBe(7);
      expect(json.data.errors.slice(5)).toEqual([
        { rowNumber: 7, column: null, message: 'Not imported: the import stopped after repeated errors. Upload the file again to finish.' },
        { rowNumber: 8, column: null, message: 'Not imported: the import stopped after repeated errors. Upload the file again to finish.' },
      ]);
    });

    it('a success resets the failure streak', async () => {
      validateResidentCsvMock.mockReturnValueOnce({
        header: ['name', 'email', 'role', 'unit_number'],
        rows: Array.from({ length: 9 }, (_, i) => ({
          rowNumber: i + 2,
          data: { name: `P${i}`, email: `p${i}@x.com`, role: 'owner', unit_number: '101' },
        })),
        errors: [],
      });
      loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map([['101', 7]]));
      const boom = new Error('flaky');
      importResidentRowMock
        .mockRejectedValueOnce(boom).mockRejectedValueOnce(boom).mockRejectedValueOnce(boom).mockRejectedValueOnce(boom)
        .mockResolvedValueOnce('ok')
        .mockRejectedValueOnce(boom).mockRejectedValueOnce(boom).mockRejectedValueOnce(boom).mockRejectedValueOnce(boom);

      const json = (await (await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: false }))).json()) as ImportJson;

      expect(importResidentRowMock).toHaveBeenCalledTimes(9);
      expect(json.data.importedCount).toBe(1);
    });

    it('names a membership race instead of the generic message', async () => {
      threeRows();
      loadUnitNumberMapForImportMock.mockResolvedValueOnce(new Map([['101', 7]]));
      // postgres.js puts the SQLSTATE on `.cause` (postgres-error-shape test).
      const race = Object.assign(new Error('Failed query'), {
        cause: Object.assign(new Error('duplicate key'), {
          code: '23505',
          constraint_name: 'user_roles_user_community_unique',
        }),
      });
      importResidentRowMock
        .mockResolvedValueOnce('u-a')
        .mockRejectedValueOnce(race)
        .mockResolvedValueOnce('u-c');

      const json = (await (await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: false }))).json()) as ImportJson;

      expect(json.data.importedCount).toBe(2);
      // An expected race is not an error report.
      expect(captureExceptionMock).not.toHaveBeenCalled();
      expect(json.data.errors).toEqual([
        {
          rowNumber: 3,
          column: 'email',
          message:
            "'b@x.com' was added while this import ran, so nothing was saved for this row. Upload the file again to see where it stands.",
        },
      ]);
    });
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
    // One call per row: user, membership, preferences and audit are written
    // together in that row's transaction (onboarding audit F2).
    expect(importResidentRowMock).toHaveBeenCalledTimes(1);
    expect(importResidentRowMock).toHaveBeenCalledWith({
      communityId: 42,
      actorUserId: 'actor-1',
      email: 'ada@x.com',
      fullName: 'Ada',
      existingUserId: null,
      isUnitOwner: true,
      unitId: 7,
      displayTitle: 'Owner',
      legacyRole: 'owner',
      bulkCount: 1,
    });
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
    // Proves the real-import path ran: the preview loads the community type too,
    // so the distinguishing signal is the import summary shape asserted above.
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
        expect(importResidentRowMock).not.toHaveBeenCalled();
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
    expect(importResidentRowMock).not.toHaveBeenCalled();
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
    expect(importResidentRowMock).not.toHaveBeenCalled();
  });

  it('skips a row whose email belongs to a user the actor cannot already see', async () => {
    // Issue #940. `loadUserEmailMapForImport` searches the platform-wide `users`
    // table (no `community_id`, so the scoped client does not filter it), so a
    // CSV row can name a resident of ANOTHER association. Importing them would
    // publish their real name, email and phone through this community's
    // residents list — one row per victim, and silently, since this path sends
    // no email.
    validateResidentCsvMock.mockReturnValueOnce({
      header: ['name', 'email', 'role', 'unit_number'],
      rows: [
        {
          rowNumber: 2,
          data: { name: 'Whoever', email: 'victim@other.example.com', role: 'owner', unit_number: '' },
        },
      ],
      errors: [],
    });
    loadUserEmailMapForImportMock.mockResolvedValueOnce(
      new Map([['victim@other.example.com', 'stranger-1']]),
    );
    loadUsersWithExistingRoleForImportMock.mockResolvedValueOnce(new Set());
    assertActorMayAttachExistingUserMock.mockRejectedValueOnce(new ForbiddenError('nope'));

    const res = await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: false }));

    // The ROW is skipped, not the whole import — one stranger's address must not
    // abort an otherwise valid CSV.
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { importedCount: number; skippedCount: number; errors: Array<{ message: string }> };
    };
    expect(json.data.importedCount).toBe(0);
    expect(json.data.skippedCount).toBe(1);
    expect(json.data.errors[0]?.message).toContain('cannot already see');
    expect(importResidentRowMock).not.toHaveBeenCalled();
  });

  it("looks up only the CSV's own emails, not every user on the platform", async () => {
    validateResidentCsvMock.mockReturnValueOnce({
      header: ['name', 'email', 'role', 'unit_number'],
      rows: [
        { rowNumber: 2, data: { name: 'Ada', email: 'ada@x.com', role: 'owner', unit_number: '' } },
        { rowNumber: 3, data: { name: 'Bo', email: 'bo@x.com', role: 'tenant', unit_number: '' } },
      ],
      errors: [{ rowNumber: 4, column: 'email', message: 'Invalid email address' }],
    });

    await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: false }));

    expect(loadUserEmailMapForImportMock).toHaveBeenCalledWith(42, ['ada@x.com', 'bo@x.com']);
  });

  it('does not consult the cross-tenant guard for brand-new emails', async () => {
    validateResidentCsvMock.mockReturnValueOnce({
      header: ['name', 'email', 'role', 'unit_number'],
      rows: [
        { rowNumber: 2, data: { name: 'New Person', email: 'new@x.com', role: 'owner', unit_number: '' } },
      ],
      errors: [],
    });
    loadUserEmailMapForImportMock.mockResolvedValueOnce(new Map());
    loadUsersWithExistingRoleForImportMock.mockResolvedValueOnce(new Set());
    importResidentRowMock.mockResolvedValueOnce('brand-new-1');

    await POST(jsonPost({ communityId: 42, csv: 'c', dryRun: false }));

    expect(assertActorMayAttachExistingUserMock).not.toHaveBeenCalled();
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
