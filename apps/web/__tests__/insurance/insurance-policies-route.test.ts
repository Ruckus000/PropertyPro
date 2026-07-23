/**
 * Route tests — `/api/v1/insurance/policies`.
 *
 * Focus: the policy_number redaction for non-admin readers, the read/write
 * asymmetry (owners read, admin writes), the feature gate, and cross-tenant
 * document validation. Uses the real `getFeaturesForCommunity`.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  requireActiveSubscriptionForMutationMock,
  createScopedClientMock,
  logAuditEventMock,
  listInsurancePoliciesMock,
  getInsurancePolicyByIdMock,
  getInsuranceDocumentByIdMock,
  createInsurancePolicyMock,
  updateInsurancePolicyByIdMock,
  softDeleteInsurancePolicyByIdMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  listInsurancePoliciesMock: vi.fn(),
  getInsurancePolicyByIdMock: vi.fn(),
  getInsuranceDocumentByIdMock: vi.fn(),
  createInsurancePolicyMock: vi.fn(),
  updateInsurancePolicyByIdMock: vi.fn(),
  softDeleteInsurancePolicyByIdMock: vi.fn(),
}));

vi.mock('@/lib/middleware/read-entitlement-guard', () => ({ requireEntitledForAdminRead: vi.fn() }));
vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
}));
vi.mock('@/lib/api/auth', () => ({ requireAuthenticatedUserId: requireAuthenticatedUserIdMock }));
vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));
vi.mock('@/lib/api/tenant-context', () => ({
  resolveEffectiveCommunityId: resolveEffectiveCommunityIdMock,
}));
vi.mock('@/lib/db/access-control', () => ({ requirePermission: requirePermissionMock }));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({ assertNotDemoGrace: assertNotDemoGraceMock }));
vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));
vi.mock('@/lib/services/insurance-service', () => ({
  listInsurancePolicies: listInsurancePoliciesMock,
  getInsurancePolicyById: getInsurancePolicyByIdMock,
  getInsuranceDocumentById: getInsuranceDocumentByIdMock,
  createInsurancePolicy: createInsurancePolicyMock,
  updateInsurancePolicyById: updateInsurancePolicyByIdMock,
  softDeleteInsurancePolicyById: softDeleteInsurancePolicyByIdMock,
}));

import { GET, POST, DELETE } from '../../src/app/api/v1/insurance/policies/route';

const ADMIN = {
  userId: 'u-admin',
  communityId: 42,
  communityName: 'Sunset Condos',
  // property_manager is admin-tier per isAdminRole (drives policyNumber visibility).
  role: 'property_manager' as const,
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718' as const,
};
const OWNER = { ...ADMIN, userId: 'u-owner', role: 'resident' as const, isAdmin: false, isUnitOwner: true };
const SCOPED = { __scoped: true };
const POLICY = { id: 7, communityId: 42, carrierName: 'Citizens', policyNumber: 'ABC-123', expiresAt: '2099-01-01' };

function getReq(cid = '42') {
  return new NextRequest(`http://localhost:3000/api/v1/insurance/policies?communityId=${cid}`);
}
function jsonReq(method: 'POST', payload: unknown) {
  return new NextRequest('http://localhost:3000/api/v1/insurance/policies', {
    method,
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  });
}
function delReq(id: number) {
  return new NextRequest(`http://localhost:3000/api/v1/insurance/policies?id=${id}&communityId=42`, {
    method: 'DELETE',
  });
}

describe('insurance policies route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('u-admin');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(ADMIN);
    requirePermissionMock.mockReturnValue(undefined);
    createScopedClientMock.mockReturnValue(SCOPED);
    logAuditEventMock.mockResolvedValue(undefined);
    listInsurancePoliciesMock.mockResolvedValue([POLICY]);
    getInsurancePolicyByIdMock.mockResolvedValue(POLICY);
    getInsuranceDocumentByIdMock.mockResolvedValue({ id: 100, communityId: 42 });
    createInsurancePolicyMock.mockResolvedValue({ ...POLICY, id: 1 });
    updateInsurancePolicyByIdMock.mockResolvedValue(POLICY);
    softDeleteInsurancePolicyByIdMock.mockResolvedValue(POLICY);
  });

  it('shows policyNumber to admins', async () => {
    const res = await GET(getReq());
    const json = await res.json();
    expect(json.data.policies[0].policyNumber).toBe('ABC-123');
    expect(json.data.policies[0].expiryBand).toBe('none');
  });

  it('strips policyNumber for a non-admin owner', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER);
    const res = await GET(getReq());
    const json = await res.json();
    expect(json.data.policies[0]).not.toHaveProperty('policyNumber');
    // owner still sees the rest
    expect(json.data.policies[0].carrierName).toBe('Citizens');
  });

  it('403s an owner attempting to create (write is admin-tier)', async () => {
    requireCommunityMembershipMock.mockResolvedValue(OWNER);
    requirePermissionMock.mockImplementation(() => {
      throw new ForbiddenError('Insufficient permissions');
    });
    const res = await POST(jsonReq('POST', { communityId: 42, policyType: 'property', carrierName: 'X', expiresAt: '2099-01-01' }));
    expect(res.status).toBe(403);
    expect(createInsurancePolicyMock).not.toHaveBeenCalled();
  });

  it('404s when the referenced document is not in this community', async () => {
    getInsuranceDocumentByIdMock.mockResolvedValue(null);
    const res = await POST(
      jsonReq('POST', { communityId: 42, policyType: 'property', carrierName: 'X', expiresAt: '2099-01-01', documentId: 999 }),
    );
    expect(res.status).toBe(404);
    expect(createInsurancePolicyMock).not.toHaveBeenCalled();
  });

  it('creates a policy and audit-logs it', async () => {
    const res = await POST(jsonReq('POST', { communityId: 42, policyType: 'wind', carrierName: 'Citizens', expiresAt: '2099-01-01' }));
    expect(res.status).toBe(200);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', resourceType: 'insurance_policy' }),
    );
  });

  it('403s for an apartment community (feature gate)', async () => {
    requireCommunityMembershipMock.mockResolvedValue({ ...ADMIN, communityType: 'apartment' as const });
    const res = await GET(getReq());
    expect(res.status).toBe(403);
  });

  it('soft-deletes a policy', async () => {
    const res = await DELETE(delReq(7));
    const json = await res.json();
    expect(json.data).toEqual({ deleted: true, id: 7 });
    expect(softDeleteInsurancePolicyByIdMock).toHaveBeenCalledWith(SCOPED, 7);
  });
});
