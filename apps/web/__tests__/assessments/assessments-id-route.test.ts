/**
 * Route unit tests — `PATCH/DELETE /api/v1/assessments/[id]`.
 *
 * Added alongside Plan A1 drain #92. Covers the contracted runRoute envelope:
 * 4-gate finance auth chain (financeEnabled async + write-perm sync +
 * admin-write sync + active-subscription async), `parsePositiveInt` →
 * `params.id` coercion, PATCH "at least one field" BadRequestError
 * preservation, loose PATCH response (`AssessmentRecord` has Date fields)
 * vs. tight DELETE `{success: z.literal(true)}` response, and null
 * x-request-id forwarding.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { BadRequestError } from '../../src/lib/api/errors/BadRequestError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requireFinanceEnabledMock,
  requireFinanceWritePermissionMock,
  requireFinanceAdminWriteMock,
  requireActiveSubscriptionForMutationMock,
  assertNotDemoGraceMock,
  updateAssessmentForCommunityMock,
  deleteAssessmentForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requireFinanceEnabledMock: vi.fn(),
  requireFinanceWritePermissionMock: vi.fn(),
  requireFinanceAdminWriteMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  updateAssessmentForCommunityMock: vi.fn(),
  deleteAssessmentForCommunityMock: vi.fn(),
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

vi.mock('@/lib/finance/common', () => ({
  requireFinanceEnabled: requireFinanceEnabledMock,
  requireFinanceWritePermission: requireFinanceWritePermissionMock,
  requireFinanceAdminWrite: requireFinanceAdminWriteMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/services/finance-service', () => ({
  updateAssessmentForCommunity: updateAssessmentForCommunityMock,
  deleteAssessmentForCommunity: deleteAssessmentForCommunityMock,
}));

import { PATCH, DELETE } from '../../src/app/api/v1/assessments/[id]/route';

const ADMIN_MEMBERSHIP = {
  userId: 'user-admin',
  communityId: 42,
  role: 'board_president' as const,
  isAdmin: true,
  isUnitOwner: false,
  displayTitle: 'Board President',
  communityType: 'condo_718' as const,
  permissions: {} as Record<string, unknown>,
};

const ASSESSMENT_RECORD = {
  id: 7,
  communityId: 42,
  title: 'Updated Title',
  description: null,
  amountCents: 25000,
  frequency: 'monthly' as const,
  dueDay: 10,
  lateFeeAmountCents: 0,
  lateFeeDaysGrace: 0,
  startDate: '2026-01-01',
  endDate: null,
  isActive: true,
  createdByUserId: 'user-admin',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-02T00:00:00Z'),
};

function jsonPatch(
  id: string | number,
  payload: unknown,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(`http://localhost:3000/api/v1/assessments/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

function jsonDelete(
  id: string | number,
  query: string,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest(
    `http://localhost:3000/api/v1/assessments/${id}${query}`,
    {
      method: 'DELETE',
      headers: { ...(headers ?? {}) },
    },
  );
}

function routeCtx(id: string) {
  return { params: Promise.resolve({ id }) };
}

describe('PATCH /api/v1/assessments/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireFinanceEnabledMock.mockResolvedValue(undefined);
    requireFinanceWritePermissionMock.mockReturnValue(undefined);
    requireFinanceAdminWriteMock.mockReturnValue(undefined);
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
    updateAssessmentForCommunityMock.mockResolvedValue(ASSESSMENT_RECORD);
  });

  it('updates an assessment with a single field (happy path)', async () => {
    const res = await PATCH(
      jsonPatch(
        7,
        { communityId: 42, isActive: false },
        { 'x-request-id': 'req-abc' },
      ),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { id: number } };
    expect(json.data.id).toBe(7);
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin');
    expect(requireFinanceEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireFinanceWritePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireFinanceAdminWriteMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(42);
    expect(updateAssessmentForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin',
      { isActive: false },
      'req-abc',
    );
  });

  it('updates an assessment with multiple fields (strips communityId from updates)', async () => {
    const res = await PATCH(
      jsonPatch(7, {
        communityId: 42,
        title: 'Updated Title',
        amountCents: 30000,
        frequency: 'quarterly',
        dueDay: 15,
      }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    expect(updateAssessmentForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin',
      {
        title: 'Updated Title',
        amountCents: 30000,
        frequency: 'quarterly',
        dueDay: 15,
      },
      null,
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await PATCH(
      jsonPatch(7, { communityId: 42, isActive: false }),
      routeCtx('7'),
    );

    expect(res.status).toBe(401);
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await PATCH(
      jsonPatch('abc', { communityId: 42, isActive: false }),
      routeCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await PATCH(
      jsonPatch('0', { communityId: 42, isActive: false }),
      routeCtx('0'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const res = await PATCH(jsonPatch(7, { isActive: false }), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body validation fails (title empty)', async () => {
    const res = await PATCH(
      jsonPatch(7, { communityId: 42, title: '' }),
      routeCtx('7'),
    );
    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when amountCents is zero', async () => {
    const res = await PATCH(
      jsonPatch(7, { communityId: 42, amountCents: 0 }),
      routeCtx('7'),
    );
    expect(res.status).toBe(400);
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when dueDay exceeds 31', async () => {
    const res = await PATCH(
      jsonPatch(7, { communityId: 42, dueDay: 32 }),
      routeCtx('7'),
    );
    expect(res.status).toBe(400);
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when startDate is not ISO YYYY-MM-DD', async () => {
    const res = await PATCH(
      jsonPatch(7, { communityId: 42, startDate: '01/15/2026' }),
      routeCtx('7'),
    );
    expect(res.status).toBe(400);
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when endDate is "invalid"', async () => {
    const res = await PATCH(
      jsonPatch(7, { communityId: 42, endDate: 'invalid' }),
      routeCtx('7'),
    );
    expect(res.status).toBe(400);
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 BadRequestError with preserved message when body has only communityId', async () => {
    const res = await PATCH(
      jsonPatch(7, { communityId: 42 }),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { message: string } };
    expect(json.error.message).toBe('At least one field must be provided for update');
    expect(resolveEffectiveCommunityIdMock).not.toHaveBeenCalled();
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await PATCH(
      jsonPatch(7, { communityId: 42, isActive: false }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member of the resolved community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await PATCH(
      jsonPatch(7, { communityId: 42, isActive: false }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireFinanceEnabledMock).not.toHaveBeenCalled();
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when finance is not enabled (write-perm NOT called)', async () => {
    requireFinanceEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Finance features are not enabled for this community type'),
    );

    const res = await PATCH(
      jsonPatch(7, { communityId: 42, isActive: false }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireFinanceWritePermissionMock).not.toHaveBeenCalled();
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when finance write permission is denied (admin-write NOT called)', async () => {
    requireFinanceWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await PATCH(
      jsonPatch(7, { communityId: 42, isActive: false }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireFinanceAdminWriteMock).not.toHaveBeenCalled();
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when admin-write is denied (active-subscription NOT called)', async () => {
    requireFinanceAdminWriteMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Only finance administrators can perform this action');
    });

    const res = await PATCH(
      jsonPatch(7, { communityId: 42, isActive: false }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(requireActiveSubscriptionForMutationMock).not.toHaveBeenCalled();
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when active subscription guard rejects', async () => {
    requireActiveSubscriptionForMutationMock.mockRejectedValueOnce(
      new ForbiddenError('Subscription inactive'),
    );

    const res = await PATCH(
      jsonPatch(7, { communityId: 42, isActive: false }),
      routeCtx('7'),
    );

    expect(res.status).toBe(403);
    expect(updateAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await PATCH(
      jsonPatch(7, { communityId: 42, isActive: false }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const call = updateAssessmentForCommunityMock.mock.calls[0];
    expect(call[4]).toBeNull();
  });
});

describe('DELETE /api/v1/assessments/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-admin');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    requireFinanceEnabledMock.mockResolvedValue(undefined);
    requireFinanceWritePermissionMock.mockReturnValue(undefined);
    requireFinanceAdminWriteMock.mockReturnValue(undefined);
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
    deleteAssessmentForCommunityMock.mockResolvedValue(undefined);
  });

  it('deletes an assessment (happy path) and returns {success:true}', async () => {
    const res = await DELETE(
      jsonDelete(7, '?communityId=42', { 'x-request-id': 'req-abc' }),
      routeCtx('7'),
    );

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { success: boolean } };
    expect(json.data).toEqual({ success: true });
    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(
      expect.anything(),
      42,
    );
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-admin');
    expect(requireFinanceEnabledMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireFinanceWritePermissionMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireFinanceAdminWriteMock).toHaveBeenCalledWith(ADMIN_MEMBERSHIP);
    expect(requireActiveSubscriptionForMutationMock).toHaveBeenCalledWith(42);
    expect(deleteAssessmentForCommunityMock).toHaveBeenCalledWith(
      42,
      7,
      'user-admin',
      'req-abc',
    );
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await DELETE(jsonDelete(7, '?communityId=42'), routeCtx('7'));

    expect(res.status).toBe(401);
    expect(deleteAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is non-numeric', async () => {
    const res = await DELETE(
      jsonDelete('abc', '?communityId=42'),
      routeCtx('abc'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(deleteAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when params.id is zero', async () => {
    const res = await DELETE(jsonDelete('0', '?communityId=42'), routeCtx('0'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(deleteAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId query is missing', async () => {
    const res = await DELETE(jsonDelete(7, ''), routeCtx('7'));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(deleteAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when communityId query is non-numeric', async () => {
    const res = await DELETE(
      jsonDelete(7, '?communityId=abc'),
      routeCtx('7'),
    );

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(deleteAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await DELETE(jsonDelete(7, '?communityId=42'), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(deleteAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await DELETE(jsonDelete(7, '?communityId=42'), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireFinanceEnabledMock).not.toHaveBeenCalled();
    expect(deleteAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when finance is not enabled (write-perm NOT called)', async () => {
    requireFinanceEnabledMock.mockRejectedValueOnce(
      new ForbiddenError('Finance features are not enabled for this community type'),
    );

    const res = await DELETE(jsonDelete(7, '?communityId=42'), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireFinanceWritePermissionMock).not.toHaveBeenCalled();
    expect(deleteAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when finance write permission is denied (admin-write NOT called)', async () => {
    requireFinanceWritePermissionMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Insufficient permissions');
    });

    const res = await DELETE(jsonDelete(7, '?communityId=42'), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireFinanceAdminWriteMock).not.toHaveBeenCalled();
    expect(deleteAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when admin-write is denied (active-subscription NOT called)', async () => {
    requireFinanceAdminWriteMock.mockImplementationOnce(() => {
      throw new ForbiddenError('Only finance administrators can perform this action');
    });

    const res = await DELETE(jsonDelete(7, '?communityId=42'), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(requireActiveSubscriptionForMutationMock).not.toHaveBeenCalled();
    expect(deleteAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when active subscription guard rejects', async () => {
    requireActiveSubscriptionForMutationMock.mockRejectedValueOnce(
      new ForbiddenError('Subscription inactive'),
    );

    const res = await DELETE(jsonDelete(7, '?communityId=42'), routeCtx('7'));

    expect(res.status).toBe(403);
    expect(deleteAssessmentForCommunityMock).not.toHaveBeenCalled();
  });

  it('forwards a null x-request-id when the header is absent', async () => {
    const res = await DELETE(jsonDelete(7, '?communityId=42'), routeCtx('7'));

    expect(res.status).toBe(200);
    const call = deleteAssessmentForCommunityMock.mock.calls[0];
    expect(call[3]).toBeNull();
  });
});
