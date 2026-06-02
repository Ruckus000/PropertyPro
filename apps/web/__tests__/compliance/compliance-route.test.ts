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
 *   - GET 400 invalid/missing communityId query
 *   - GET 401 unauth, 403 per gate (membership / condo-feature / permission)
 *   - POST happy (generate + audit), already-generated, empty-template, race
 *   - POST 400 missing communityId / extra keys (strict)
 *   - POST 401 unauth, 403 demo-grace (before membership), 403 per gate
 *   - PATCH happy per action (?? null documentId coercion), not-found 400
 *   - PATCH 400 link_document without documentId, extra keys, missing id
 *   - PATCH 401 unauth, 403 demo-grace (before membership), 403 per gate
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
}));

vi.mock('@propertypro/db', () => ({
  logAuditEvent: logAuditEventMock,
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

vi.mock('@/lib/services/compliance-service', () => ({
  listComplianceChecklistItems: listComplianceChecklistItemsMock,
  insertComplianceChecklistItems: insertComplianceChecklistItemsMock,
  updateComplianceChecklistItem: updateComplianceChecklistItemMock,
}));

import { GET, POST, PATCH } from '../../src/app/api/v1/compliance/route';

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
  getFeaturesForCommunityMock.mockReturnValue({ hasCompliance: true });
  calculateComplianceStatusMock.mockReturnValue('overdue');
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
    insertComplianceChecklistItemsMock.mockRejectedValueOnce({ code: '23505' });

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
      bodyReq('PATCH', { id: 7, communityId: 42, action: 'mark_not_applicable' }),
      undefined,
    );

    expect(res.status).toBe(200);
    expect(updateComplianceChecklistItemMock).toHaveBeenCalledWith(
      42,
      7,
      expect.objectContaining({ isApplicable: false }),
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
