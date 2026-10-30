/**
 * Route unit tests — `/api/v1/compliance` (GET / POST / PATCH).
 *
 * Added alongside the Plan A1 auto-drain of the compliance route. Replaces the
 * legacy `__tests__/compliance/route.test.ts` (which mocked at the db/service
 * layer with real RBAC + status derivation). This suite mocks the route-level
 * helpers (auth, membership, tenant-context, demo-grace, access-control, the
 * compliance-service, and the shared feature-gate) so each auth gate can be
 * isolated.
 *
 * Coverage:
 *   - GET happy path (status derivation + auto-complete fire-and-forget)
 *   - GET carries autoLinkedDocumentId and notApplicableReason
 *   - GET 400 invalid/missing communityId query
 *   - GET 401 unauth, 403 per gate (membership / condo-feature / permission)
 *   - POST happy (generate + audit), already-generated, empty-template, race
 *   - POST 400 missing communityId / extra keys (strict)
 *   - POST 401 unauth, 403 demo-grace (before membership), 403 per gate
 *   - PATCH happy per action (?? null documentId coercion), not-found 400
 *   - PATCH mark_not_applicable requires a 1-200 character reason (trimmed):
 *     stored and audited with the action; mark_applicable clears it
 *   - PATCH 400 link_document without documentId, extra keys, missing id
 *   - PATCH 401 unauth, 403 demo-grace (before membership), 403 per gate
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  assertNotDemoGraceMock,
  requirePermissionMock,
  getFeaturesForCommunityMock,
  getComplianceTemplateMock,
  calculateComplianceStatusMock,
  calculatePostingDeadlineMock,
  tryAutoCompleteMock,
  logAuditEventMock,
  listComplianceChecklistItemsMock,
  insertComplianceChecklistItemsMock,
  updateComplianceChecklistItemMock,
  findChecklistLinkConflictMock,
  createScopedClientMock,
  scopedQueryByIdMock,
  getCommunityUnitCountMock,
  documentsTable,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  getFeaturesForCommunityMock: vi.fn(),
  getComplianceTemplateMock: vi.fn(),
  calculateComplianceStatusMock: vi.fn(),
  calculatePostingDeadlineMock: vi.fn(),
  tryAutoCompleteMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  listComplianceChecklistItemsMock: vi.fn(),
  insertComplianceChecklistItemsMock: vi.fn(),
  updateComplianceChecklistItemMock: vi.fn(),
  findChecklistLinkConflictMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  scopedQueryByIdMock: vi.fn(),
  getCommunityUnitCountMock: vi.fn(),
  documentsTable: Symbol('documents'),
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
  // Loaded transitively via documents-service's deleted-documents read. Both
  // are real values, not spies: nothing here asserts on them.
  MAX_PAGE_SIZE: 100,
  buildSourceTypeFilter: () => ({ __sourceTypeFilter: true }),
  createScopedClient: createScopedClientMock,
  documents: documentsTable,
}));

vi.mock('@propertypro/shared', async () => {
  const actual = await vi.importActual<typeof import('@propertypro/shared')>('@propertypro/shared');
  return {
    ...actual,
    getFeaturesForCommunity: getFeaturesForCommunityMock,
    getComplianceTemplate: getComplianceTemplateMock,
  };
});

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: requirePermissionMock,
}));

vi.mock('@/lib/utils/compliance-calculator', () => ({
  calculateComplianceStatus: calculateComplianceStatusMock,
  calculatePostingDeadline: calculatePostingDeadlineMock,
}));

vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  tryAutoComplete: tryAutoCompleteMock,
}));

vi.mock('@/lib/services/community-profile-service', () => ({
  getCommunityUnitCount: getCommunityUnitCountMock,
}));

vi.mock('@/lib/services/compliance-service', () => ({
  listComplianceChecklistItems: listComplianceChecklistItemsMock,
  insertComplianceChecklistItems: insertComplianceChecklistItemsMock,
  updateComplianceChecklistItem: updateComplianceChecklistItemMock,
  findChecklistLinkConflict: findChecklistLinkConflictMock,
}));

import { GET, POST, PATCH } from '../../src/app/api/v1/compliance/route';
import { drizzleUniqueViolation } from '../helpers/pg-errors';

const USER_ID = 'f8a6fbc9-ae4f-4f13-ad8b-a5217af0bd81';

const MEMBERSHIP = {
  role: 'manager',
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
};

function getReq(communityId?: string): NextRequest {
  const url =
    communityId === undefined
      ? 'http://localhost:3000/api/v1/compliance'
      : `http://localhost:3000/api/v1/compliance?communityId=${communityId}`;
  return new NextRequest(url);
}

function bodyReq(method: 'POST' | 'PATCH', payload: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/compliance', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue(USER_ID);
  resolveEffectiveCommunityIdMock.mockImplementation(
    (_req: unknown, communityId: number) => communityId,
  );
  assertNotDemoGraceMock.mockResolvedValue(undefined);
  requireCommunityMembershipMock.mockResolvedValue(MEMBERSHIP);
  requirePermissionMock.mockReturnValue(undefined);
  // Cross-tenant FK guard: link_document resolves the referenced document via
  // queryById. Default to "found in this community" so happy paths pass.
  scopedQueryByIdMock.mockResolvedValue({ id: 1 });
  createScopedClientMock.mockReturnValue({ queryById: scopedQueryByIdMock });
  findChecklistLinkConflictMock.mockResolvedValue(null);
  getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: true });
  calculateComplianceStatusMock.mockReturnValue('overdue');
  getCommunityUnitCountMock.mockResolvedValue(null);
  calculatePostingDeadlineMock.mockReturnValue(new Date('2026-01-01T00:00:00Z'));
  tryAutoCompleteMock.mockResolvedValue(undefined);
  logAuditEventMock.mockResolvedValue(undefined);
  getComplianceTemplateMock.mockReturnValue([
    {
      templateKey: '718_budget',
      title: 'Budget',
      description: 'Budget posting',
      category: 'financial_records',
      statuteReference: '§718.112(2)(f)',
      deadlineDays: 30,
    },
  ]);
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe('GET /api/v1/compliance', () => {
  it('lists checklist rows with derived status (happy path)', async () => {
    listComplianceChecklistItemsMock.mockResolvedValueOnce([
      {
        id: 1,
        templateKey: '718_budget',
        documentId: null,
        documentPostedAt: null,
        deadline: '2026-01-01T00:00:00.000Z',
        rollingWindow: null,
      },
    ]);

    const res = await GET(getReq('55'), undefined);

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Array<{ id: number; status: string }> };
    expect(json.data[0]?.id).toBe(1);
    expect(json.data[0]?.status).toBe('overdue');
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), 55);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(55, USER_ID);
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'compliance', 'read');
    expect(tryAutoCompleteMock).toHaveBeenCalledWith(55, USER_ID, 'review_compliance');
    // B2: board/owner/tenant checklists carry `check_compliance` — fire it on read
    // so those roles can actually reach 100%.
    expect(tryAutoCompleteMock).toHaveBeenCalledWith(55, USER_ID, 'check_compliance');
  });

  it('says whether each linked file is posted, a draft, or deleted', async () => {
    // The website editor's Documents tool needs this: `status` reads a draft
    // and a deleted file alike as "not linked", but one is "post it" and the
    // other "upload again".
    listComplianceChecklistItemsMock.mockResolvedValueOnce([
      { id: 1, templateKey: 'a', documentId: 10, documentPostedAt: null, deadline: null, rollingWindow: null },
      { id: 2, templateKey: 'b', documentId: 11, documentPostedAt: null, deadline: null, rollingWindow: null },
      { id: 3, templateKey: 'c', documentId: 12, documentPostedAt: null, deadline: null, rollingWindow: null },
      { id: 4, templateKey: 'd', documentId: null, documentPostedAt: null, deadline: null, rollingWindow: null },
    ]);
    const queryWhere = vi.fn().mockResolvedValueOnce([
      { id: 10, deletedAt: null, postedAt: '2026-09-01T00:00:00.000Z' },
      { id: 11, deletedAt: null, postedAt: null },
      { id: 12, deletedAt: '2026-09-05T00:00:00.000Z', postedAt: '2026-09-01T00:00:00.000Z' },
    ]);
    createScopedClientMock.mockReturnValue({ queryById: scopedQueryByIdMock, queryWhere });

    const res = await GET(getReq('55'), undefined);

    const json = (await res.json()) as { data: Array<{ id: number; documentState: unknown }> };
    expect(json.data.map((r) => [r.id, r.documentState])).toEqual([
      [1, 'posted'],
      [2, 'draft'],
      [3, 'deleted'],
      [4, null],
    ]);
  });

  it('returns autoLinkedDocumentId and notApplicableReason', async () => {
    // The website's records screens read both. An item counts as linked
    // automatically while documentId === autoLinkedDocumentId (a manual relink
    // or unlink moves documentId and leaves this behind), and a "doesn't apply"
    // item shows the reason its manager gave.
    listComplianceChecklistItemsMock.mockResolvedValueOnce([
      {
        id: 1,
        templateKey: '718_budget',
        isApplicable: true,
        documentId: 31,
        autoLinkedDocumentId: 31,
        notApplicableReason: null,
        documentPostedAt: '2026-09-01T00:00:00.000Z',
        deadline: null,
        rollingWindow: null,
      },
      {
        id: 2,
        templateKey: '718_sirs',
        isApplicable: false,
        documentId: null,
        autoLinkedDocumentId: null,
        notApplicableReason: 'Our building is under three stories.',
        documentPostedAt: null,
        deadline: null,
        rollingWindow: null,
      },
    ]);
    const queryWhere = vi
      .fn()
      .mockResolvedValueOnce([{ id: 31, deletedAt: null, postedAt: '2026-09-01T00:00:00.000Z' }]);
    createScopedClientMock.mockReturnValue({ queryById: scopedQueryByIdMock, queryWhere });

    const res = await GET(getReq('55'), undefined);

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Array<Record<string, unknown>> };
    expect(json.data[0]).toMatchObject({
      id: 1,
      documentId: 31,
      autoLinkedDocumentId: 31,
      notApplicableReason: null,
    });
    expect(json.data[1]).toMatchObject({
      id: 2,
      autoLinkedDocumentId: null,
      notApplicableReason: 'Our building is under three stories.',
    });
  });

  it('drops the posting clock below the website rule’s size threshold', async () => {
    // A 12-unit condo: §718.111(12)(g) does not apply, so no deadline or
    // rolling window reaches the calculator or the client.
    getCommunityUnitCountMock.mockResolvedValueOnce(12);
    listComplianceChecklistItemsMock.mockResolvedValueOnce([
      {
        id: 1,
        templateKey: '718_bylaws',
        documentId: null,
        documentPostedAt: null,
        deadline: '2026-01-01T00:00:00.000Z',
        rollingWindow: { months: 12 },
      },
    ]);
    calculateComplianceStatusMock.mockReturnValueOnce('unsatisfied');

    const res = await GET(getReq('55'), undefined);

    expect(getCommunityUnitCountMock).toHaveBeenCalledWith(55);
    expect(calculateComplianceStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ deadline: null, rollingWindowMonths: null }),
    );
    const json = (await res.json()) as { data: Array<Record<string, unknown>> };
    expect(json.data[0]).toMatchObject({ deadline: null, rollingWindow: null, status: 'unsatisfied' });
  });

  it('keeps the posting clock when the size is unknown', async () => {
    listComplianceChecklistItemsMock.mockResolvedValueOnce([
      {
        id: 1,
        templateKey: '718_bylaws',
        documentId: null,
        documentPostedAt: null,
        deadline: '2026-01-01T00:00:00.000Z',
        rollingWindow: null,
      },
    ]);

    await GET(getReq('55'), undefined);

    expect(calculateComplianceStatusMock).toHaveBeenCalledWith(
      expect.objectContaining({ deadline: new Date('2026-01-01T00:00:00.000Z') }),
    );
  });

  it('does not fire auto-complete when there are zero rows', async () => {
    listComplianceChecklistItemsMock.mockResolvedValueOnce([]);

    const res = await GET(getReq('55'), undefined);

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: unknown[] };
    expect(json.data).toEqual([]);
    expect(tryAutoCompleteMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId query is missing', async () => {
    const res = await GET(getReq(undefined), undefined);

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(listComplianceChecklistItemsMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId is non-numeric', async () => {
    const res = await GET(getReq('abc'), undefined);

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(listComplianceChecklistItemsMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId is zero', async () => {
    const res = await GET(getReq('0'), undefined);

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(listComplianceChecklistItemsMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await GET(getReq('55'), undefined);

    expect(res.status).toBe(401);
    expect(listComplianceChecklistItemsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const res = await GET(getReq('55'), undefined);

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(listComplianceChecklistItemsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when community lacks the compliance feature (apartment)', async () => {
    getFeaturesForCommunityMock.mockReturnValueOnce({ hasCompliance: false });

    const res = await GET(getReq('55'), undefined);

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(listComplianceChecklistItemsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when compliance.read permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await GET(getReq('55'), undefined);

    expect(res.status).toBe(403);
    expect(listComplianceChecklistItemsMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

describe('POST /api/v1/compliance', () => {
  it('generates checklist rows and logs an audit event (happy path)', async () => {
    listComplianceChecklistItemsMock
      .mockResolvedValueOnce([]) // existing check
      .mockResolvedValueOnce([{ id: 100, templateKey: '718_budget' }]); // post-insert read
    insertComplianceChecklistItemsMock.mockResolvedValueOnce(undefined);

    const res = await POST(bodyReq('POST', { communityId: 42 }), undefined);

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: Array<{ id: number }> };
    expect(json.data[0]?.id).toBe(100);

    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, USER_ID);
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'compliance', 'write');
    expect(insertComplianceChecklistItemsMock).toHaveBeenCalledWith(
      42,
      expect.arrayContaining([expect.objectContaining({ templateKey: '718_budget' })]),
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        resourceType: 'compliance_checklist',
        communityId: 42,
      }),
    );
  });

  it('returns existing rows with alreadyGenerated meta when checklist exists', async () => {
    listComplianceChecklistItemsMock.mockResolvedValueOnce([
      { id: 10, templateKey: '718_budget' },
    ]);

    const res = await POST(bodyReq('POST', { communityId: 42 }), undefined);

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { data: Array<{ id: number }>; meta: { alreadyGenerated: boolean } };
    };
    expect(json.data.meta.alreadyGenerated).toBe(true);
    expect(json.data.data[0]?.id).toBe(10);
    expect(insertComplianceChecklistItemsMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns emptyTemplate meta when template is empty', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    listComplianceChecklistItemsMock.mockResolvedValueOnce([]);
    getComplianceTemplateMock.mockReturnValueOnce([]);

    const res = await POST(bodyReq('POST', { communityId: 42 }), undefined);

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { data: unknown[]; meta: { emptyTemplate: boolean } };
    };
    expect(json.data.data).toEqual([]);
    expect(json.data.meta.emptyTemplate).toBe(true);
    expect(insertComplianceChecklistItemsMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('recovers from a unique-violation race and returns alreadyGenerated', async () => {
    listComplianceChecklistItemsMock
      .mockResolvedValueOnce([]) // existing check
      .mockResolvedValueOnce([{ id: 11, templateKey: '718_budget' }]); // raced re-read
    insertComplianceChecklistItemsMock.mockRejectedValueOnce(
      drizzleUniqueViolation('compliance_checklist_community_template_key_active'),
    );

    const res = await POST(bodyReq('POST', { communityId: 42 }), undefined);

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: { data: Array<{ id: number }>; meta: { alreadyGenerated: boolean } };
    };
    expect(json.data.meta.alreadyGenerated).toBe(true);
    expect(json.data.data[0]?.id).toBe(11);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('re-throws a non-unique-violation insert error', async () => {
    listComplianceChecklistItemsMock.mockResolvedValueOnce([]);
    insertComplianceChecklistItemsMock.mockRejectedValueOnce(new Error('connection lost'));

    const res = await POST(bodyReq('POST', { communityId: 42 }), undefined);

    expect(res.status).toBe(500);
  });

  it('returns 400 VALIDATION_ERROR when communityId is missing', async () => {
    const res = await POST(bodyReq('POST', {}), undefined);

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when the body carries extra keys (strict)', async () => {
    const res = await POST(
      bodyReq('POST', { communityId: 42, communityType: 'condo_718' }),
      undefined,
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(bodyReq('POST', { communityId: 42 }), undefined);

    expect(res.status).toBe(401);
    expect(insertComplianceChecklistItemsMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership runs)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(bodyReq('POST', { communityId: 42 }), undefined);

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const res = await POST(bodyReq('POST', { communityId: 42 }), undefined);

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when community lacks the compliance feature (apartment)', async () => {
    getFeaturesForCommunityMock.mockReturnValueOnce({ hasCompliance: false });

    const res = await POST(bodyReq('POST', { communityId: 42 }), undefined);

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(insertComplianceChecklistItemsMock).not.toHaveBeenCalled();
  });

  it('returns 403 when compliance.write permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await POST(bodyReq('POST', { communityId: 42 }), undefined);

    expect(res.status).toBe(403);
    expect(insertComplianceChecklistItemsMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// PATCH
// ---------------------------------------------------------------------------

describe('PATCH /api/v1/compliance', () => {
  it('links a document and logs an audit event (happy path)', async () => {
    updateComplianceChecklistItemMock.mockResolvedValueOnce({
      id: 5,
      title: 'Budget',
      documentId: 77,
      documentPostedAt: '2026-01-01T00:00:00.000Z',
      deadline: null,
      rollingWindow: null,
    });

    const res = await PATCH(
      bodyReq('PATCH', { id: 5, communityId: 42, action: 'link_document', documentId: 77 }),
      undefined,
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number; status: string } };
    expect(json.data.id).toBe(5);
    expect(json.data.status).toBe('overdue');

    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requirePermissionMock).toHaveBeenCalledWith(MEMBERSHIP, 'compliance', 'write');
    expect(updateComplianceChecklistItemMock).toHaveBeenCalledWith(
      42,
      5,
      expect.objectContaining({ documentId: 77, lastModifiedBy: USER_ID }),
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'link_document',
        resourceType: 'compliance_checklist_item',
        resourceId: '5',
        newValues: { documentId: 77 },
      }),
    );
  });

  it('refuses with 409 a file already posted as another record, writing nothing', async () => {
    findChecklistLinkConflictMock.mockResolvedValueOnce('document_fills_another_record');

    const res = await PATCH(
      bodyReq('PATCH', { id: 5, communityId: 42, action: 'link_document', documentId: 77 }),
      undefined,
    );

    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toContain('This file is already posted as another record.');
    expect(updateComplianceChecklistItemMock).not.toHaveBeenCalled();
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('refuses with 409 a record that already has a different file, writing nothing', async () => {
    findChecklistLinkConflictMock.mockResolvedValueOnce('record_has_another_document');

    const res = await PATCH(
      bodyReq('PATCH', { id: 5, communityId: 42, action: 'link_document', documentId: 77 }),
      undefined,
    );

    expect(res.status).toBe(409);
    expect(JSON.stringify(await res.json())).toContain(
      'This record already has a file. Remove it first to replace it.',
    );
    expect(updateComplianceChecklistItemMock).not.toHaveBeenCalled();
  });

  it('asks about conflicts with replace only when the body says so', async () => {
    updateComplianceChecklistItemMock.mockResolvedValue({ id: 5, title: 'Budget', documentId: 77 });

    await PATCH(bodyReq('PATCH', { id: 5, communityId: 42, action: 'link_document', documentId: 77 }), undefined);
    await PATCH(
      bodyReq('PATCH', { id: 5, communityId: 42, action: 'link_document', documentId: 77, replace: true }),
      undefined,
    );

    expect(findChecklistLinkConflictMock.mock.calls).toEqual([
      [42, 5, 77, { replace: false }],
      [42, 5, 77, { replace: true }],
    ]);
  });

  it('coerces a missing documentId to null in the audit newValues (unlink action)', async () => {
    updateComplianceChecklistItemMock.mockResolvedValueOnce({
      id: 6,
      title: 'Budget',
      documentId: null,
      documentPostedAt: null,
      deadline: null,
      rollingWindow: null,
    });

    const res = await PATCH(
      bodyReq('PATCH', { id: 6, communityId: 42, action: 'unlink_document' }),
      undefined,
    );

    expect(res.status).toBe(200);
    expect(updateComplianceChecklistItemMock).toHaveBeenCalledWith(
      42,
      6,
      expect.objectContaining({ documentId: null, documentPostedAt: null }),
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ newValues: { documentId: null } }),
    );
  });

  it('marks an item not applicable', async () => {
    updateComplianceChecklistItemMock.mockResolvedValueOnce({
      id: 7,
      title: 'Budget',
      isApplicable: false,
      deadline: null,
      rollingWindow: null,
    });

    const res = await PATCH(
      bodyReq('PATCH', {
        id: 7,
        communityId: 42,
        action: 'mark_not_applicable',
        reason: 'Our building has no elevator.',
      }),
      undefined,
    );

    expect(res.status).toBe(200);
    expect(updateComplianceChecklistItemMock).toHaveBeenCalledWith(
      42,
      7,
      expect.objectContaining({ isApplicable: false }),
    );
  });

  it('stores and audits the reason', async () => {
    updateComplianceChecklistItemMock.mockResolvedValueOnce({
      id: 7,
      title: 'Budget',
      isApplicable: false,
      notApplicableReason: 'Our building has no elevator.',
      deadline: null,
      rollingWindow: null,
    });

    const res = await PATCH(
      bodyReq('PATCH', {
        id: 7,
        communityId: 42,
        action: 'mark_not_applicable',
        reason: '  Our building has no elevator.  ',
      }),
      undefined,
    );

    expect(res.status).toBe(200);
    // Stored trimmed, and the update carries nothing the action did not ask for.
    expect(updateComplianceChecklistItemMock).toHaveBeenCalledWith(42, 7, {
      isApplicable: false,
      notApplicableReason: 'Our building has no elevator.',
      lastModifiedBy: USER_ID,
    });
    // The audit row carries the reason and nothing else in newValues.
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'mark_not_applicable',
        resourceType: 'compliance_checklist_item',
        resourceId: '7',
        newValues: { reason: 'Our building has no elevator.' },
      }),
    );
  });

  it('accepts a reason of exactly 200 characters', async () => {
    const reason = 'x'.repeat(200);
    updateComplianceChecklistItemMock.mockResolvedValueOnce({
      id: 7,
      title: 'Budget',
      isApplicable: false,
      notApplicableReason: reason,
      deadline: null,
      rollingWindow: null,
    });

    const res = await PATCH(
      bodyReq('PATCH', { id: 7, communityId: 42, action: 'mark_not_applicable', reason }),
      undefined,
    );

    expect(res.status).toBe(200);
    expect(updateComplianceChecklistItemMock).toHaveBeenCalledWith(
      42,
      7,
      expect.objectContaining({ notApplicableReason: reason }),
    );
  });

  describe('a reason that mark_not_applicable cannot accept', () => {
    // A row exists, so the only thing standing between these requests and a
    // 200 is the body schema. `vi.clearAllMocks()` keeps implementations, so
    // this one is reset here rather than left to leak into the next test.
    beforeEach(() => {
      updateComplianceChecklistItemMock.mockResolvedValue({
        id: 7,
        title: 'Budget',
        isApplicable: false,
        deadline: null,
        rollingWindow: null,
      });
    });

    afterEach(() => {
      updateComplianceChecklistItemMock.mockReset();
    });

    type ValidationBody = {
      error: { code: string; details: { fields: Array<{ field: string }> } };
    };

    async function expectReasonRejected(payload: Record<string, unknown>): Promise<void> {
      const res = await PATCH(bodyReq('PATCH', payload), undefined);

      expect(res.status).toBe(400);
      const json = (await res.json()) as ValidationBody;
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(json.error.details.fields.map((f) => f.field)).toEqual(['reason']);
      expect(updateComplianceChecklistItemMock).not.toHaveBeenCalled();
      expect(logAuditEventMock).not.toHaveBeenCalled();
    }

    it('returns 400 when mark_not_applicable has no reason', async () => {
      await expectReasonRejected({ id: 7, communityId: 42, action: 'mark_not_applicable' });
    });

    it.each([
      ['empty', ''],
      ['only spaces', '   '],
      ['over 200 characters', 'x'.repeat(201)],
    ])('returns 400 when the reason is %s', async (_label, reason) => {
      await expectReasonRejected({ id: 7, communityId: 42, action: 'mark_not_applicable', reason });
    });
  });

  it('mark_applicable clears the reason', async () => {
    updateComplianceChecklistItemMock.mockResolvedValueOnce({
      id: 8,
      title: 'Budget',
      isApplicable: true,
      notApplicableReason: null,
      deadline: null,
      rollingWindow: null,
    });

    const res = await PATCH(
      bodyReq('PATCH', { id: 8, communityId: 42, action: 'mark_applicable' }),
      undefined,
    );

    expect(res.status).toBe(200);
    expect(updateComplianceChecklistItemMock).toHaveBeenCalledWith(42, 8, {
      isApplicable: true,
      notApplicableReason: null,
      lastModifiedBy: USER_ID,
    });
  });

  it('does not store or audit a reason sent with another action', async () => {
    updateComplianceChecklistItemMock.mockResolvedValueOnce({
      id: 5,
      title: 'Budget',
      documentId: 77,
      documentPostedAt: '2026-01-01T00:00:00.000Z',
      deadline: null,
      rollingWindow: null,
    });

    const res = await PATCH(
      bodyReq('PATCH', {
        id: 5,
        communityId: 42,
        action: 'link_document',
        documentId: 77,
        reason: 'Not a reason this action keeps.',
      }),
      undefined,
    );

    expect(res.status).toBe(200);
    expect(updateComplianceChecklistItemMock.mock.calls[0]?.[2]).not.toHaveProperty(
      'notApplicableReason',
    );
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'link_document', newValues: { documentId: 77 } }),
    );
  });

  it('returns 400 when the checklist item is not found', async () => {
    updateComplianceChecklistItemMock.mockResolvedValueOnce(null);

    const res = await PATCH(
      bodyReq('PATCH', { id: 999, communityId: 42, action: 'mark_applicable' }),
      undefined,
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('returns 400 when action is link_document but documentId is missing (refinement)', async () => {
    const res = await PATCH(
      bodyReq('PATCH', { id: 5, communityId: 42, action: 'link_document' }),
      undefined,
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateComplianceChecklistItemMock).not.toHaveBeenCalled();
  });

  it('returns 400 when id is missing', async () => {
    const res = await PATCH(
      bodyReq('PATCH', { communityId: 42, action: 'mark_applicable' }),
      undefined,
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateComplianceChecklistItemMock).not.toHaveBeenCalled();
  });

  it('returns 400 when the body carries extra keys (strict)', async () => {
    const res = await PATCH(
      bodyReq('PATCH', { id: 5, communityId: 42, action: 'mark_applicable', extra: true }),
      undefined,
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateComplianceChecklistItemMock).not.toHaveBeenCalled();
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(
      bodyReq('PATCH', { id: 5, communityId: 42, action: 'mark_applicable' }),
      undefined,
    );

    expect(res.status).toBe(401);
    expect(updateComplianceChecklistItemMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership runs)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await PATCH(
      bodyReq('PATCH', { id: 5, communityId: 42, action: 'mark_applicable' }),
      undefined,
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError('Not a member'));

    const res = await PATCH(
      bodyReq('PATCH', { id: 5, communityId: 42, action: 'mark_applicable' }),
      undefined,
    );

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
  });

  it('returns 403 when community lacks the compliance feature (apartment)', async () => {
    getFeaturesForCommunityMock.mockReturnValueOnce({ hasCompliance: false });

    const res = await PATCH(
      bodyReq('PATCH', { id: 5, communityId: 42, action: 'mark_applicable' }),
      undefined,
    );

    expect(res.status).toBe(403);
    expect(requirePermissionMock).not.toHaveBeenCalled();
    expect(updateComplianceChecklistItemMock).not.toHaveBeenCalled();
  });

  it('returns 403 when compliance.write permission is denied', async () => {
    requirePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await PATCH(
      bodyReq('PATCH', { id: 5, communityId: 42, action: 'mark_applicable' }),
      undefined,
    );

    expect(res.status).toBe(403);
    expect(updateComplianceChecklistItemMock).not.toHaveBeenCalled();
  });
});
