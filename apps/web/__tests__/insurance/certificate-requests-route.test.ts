/**
 * Route tests — `POST /api/v1/insurance/certificate-requests`.
 *
 * The relay's defining behaviors: it emails the agent with Reply-To set to the
 * OWNER, rate-limits per user, and 422s when the policy has no agent on file.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  createScopedClientMock,
  logAuditEventMock,
  getRateLimiterMock,
  sendEmailMock,
  getInsurancePolicyByIdMock,
  createCertificateRequestMock,
  getRequesterContactMock,
  selectFromMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  requirePermissionMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  createScopedClientMock: vi.fn(),
  logAuditEventMock: vi.fn(),
  getRateLimiterMock: vi.fn(),
  sendEmailMock: vi.fn(),
  getInsurancePolicyByIdMock: vi.fn(),
  createCertificateRequestMock: vi.fn(),
  getRequesterContactMock: vi.fn(),
  selectFromMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  logAuditEvent: logAuditEventMock,
  users: { __table: 'users' },
}));
vi.mock('@propertypro/db/filters', () => ({ eq: (c: unknown, v: unknown) => ({ __eq: { c, v } }) }));
vi.mock('@propertypro/email', () => ({
  sendEmail: sendEmailMock,
  CertificateRequestEmail: (props: unknown) => props,
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
vi.mock('@/lib/middleware/rate-limiter', () => ({ getRateLimiter: getRateLimiterMock }));
vi.mock('@/lib/services/insurance-service', () => ({
  getInsurancePolicyById: getInsurancePolicyByIdMock,
  createCertificateRequest: createCertificateRequestMock,
  getRequesterContact: getRequesterContactMock,
  listCertificateRequests: vi.fn(),
}));

import { POST } from '../../src/app/api/v1/insurance/certificate-requests/route';

const OWNER = {
  userId: 'u-owner',
  communityId: 42,
  communityName: 'Sunset Condos',
  role: 'resident' as const,
  isAdmin: false,
  isUnitOwner: true,
  communityType: 'condo_718' as const,
};
const VALID_BODY = {
  communityId: 42,
  policyId: 7,
  unitLabel: '4B',
  recipientName: 'Acme Lender',
  recipientEmail: 'lender@acme.example',
};

function req(payload: unknown) {
  return new NextRequest('http://localhost:3000/api/v1/insurance/certificate-requests', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json' },
  });
}

describe('certificate requests route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('u-owner');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(OWNER);
    requirePermissionMock.mockReturnValue(undefined);
    getRateLimiterMock.mockReturnValue({ check: () => ({ allowed: true, retryAfter: 0 }) });
    sendEmailMock.mockResolvedValue({ id: 'msg-1' });
    getRequesterContactMock.mockResolvedValue({ email: 'olivia@owner.example', fullName: 'Olivia Owner' });
    selectFromMock.mockResolvedValue([{ id: 'u-owner', email: 'olivia@owner.example', fullName: 'Olivia Owner' }]);
    createScopedClientMock.mockReturnValue({ selectFrom: selectFromMock });
    logAuditEventMock.mockResolvedValue(undefined);
    getInsurancePolicyByIdMock.mockResolvedValue({
      id: 7,
      communityId: 42,
      carrierName: 'Citizens',
      policyNumber: 'ABC-123',
      agentEmail: 'agent@insure.example',
      agentName: 'Pat Agent',
    });
    createCertificateRequestMock.mockResolvedValue({ id: 1 });
  });

  it('relays to the agent with Reply-To set to the owner', async () => {
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(200);

    // first send is the agent relay
    const agentCall = sendEmailMock.mock.calls[0][0];
    expect(agentCall.to).toBe('agent@insure.example');
    expect(agentCall.replyTo).toBe('olivia@owner.example');
    expect(agentCall.category).toBe('transactional');

    // second send is the requester confirmation
    expect(sendEmailMock.mock.calls[1][0].to).toBe('olivia@owner.example');

    expect(createCertificateRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ requestedBy: 'u-owner', status: 'sent' }),
    );
  });

  it('422s (ValidationError) when the policy has no agent email', async () => {
    getInsurancePolicyByIdMock.mockResolvedValue({ id: 7, communityId: 42, carrierName: 'Citizens', agentEmail: null });
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(createCertificateRequestMock).not.toHaveBeenCalled();
  });

  it('rate-limits per user', async () => {
    getRateLimiterMock.mockReturnValue({ check: () => ({ allowed: false, retryAfter: 3600 }) });
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(429);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('records status=failed and 400s when the relay send throws', async () => {
    sendEmailMock.mockRejectedValue(new Error('resend down'));
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(400);
    // the attempt is still recorded as failed
    expect(createCertificateRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ status: 'failed' }),
    );
  });
});
