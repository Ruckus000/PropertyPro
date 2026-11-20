/**
 * Route tests — `POST /api/v1/insurance/certificate-requests`.
 *
 * The relay's defining behaviors: it emails the agent with Reply-To set to the
 * OWNER, rate-limits per user, and 422s when the policy has no agent on file.
 * The request names one of the owner's OWN units; the label the agent sees is
 * derived server-side from that unit, never typed by the requester.
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
  listCertificateRequestsMock,
  requireEntitledForAdminReadMock,
  listActorUnitIdsMock,
  listLiveUnitOptionsMock,
  rateCheckMock,
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
  listCertificateRequestsMock: vi.fn(),
  requireEntitledForAdminReadMock: vi.fn(),
  listActorUnitIdsMock: vi.fn(),
  listLiveUnitOptionsMock: vi.fn(),
  rateCheckMock: vi.fn(),
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
  listCertificateRequests: listCertificateRequestsMock,
}));
vi.mock('@/lib/middleware/read-entitlement-guard', () => ({
  requireEntitledForAdminRead: requireEntitledForAdminReadMock,
}));
vi.mock('@/lib/units/actor-units', () => ({ listActorUnitIds: listActorUnitIdsMock }));
vi.mock('@/lib/units/unit-labels', () => ({ listLiveUnitOptions: listLiveUnitOptionsMock }));

import { GET, POST } from '../../src/app/api/v1/insurance/certificate-requests/route';

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
  unitId: 104,
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
    rateCheckMock.mockReturnValue({ allowed: true, retryAfter: 0 });
    getRateLimiterMock.mockReturnValue({ check: rateCheckMock });
    listActorUnitIdsMock.mockResolvedValue([104]);
    listLiveUnitOptionsMock.mockImplementation(async (_scoped: unknown, ids: number[]) =>
      ids.includes(104) ? [{ id: 104, label: 'Bldg A • Unit 4B' }] : [],
    );
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
    const agentCall = sendEmailMock.mock.calls[0]![0];
    expect(agentCall.to).toBe('agent@insure.example');
    expect(agentCall.replyTo).toBe('olivia@owner.example');
    expect(agentCall.category).toBe('transactional');

    // second send is the requester confirmation
    expect(sendEmailMock.mock.calls[1]![0].to).toBe('olivia@owner.example');

    expect(createCertificateRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ requestedBy: 'u-owner', status: 'sent' }),
    );
  });

  it('derives the unit label from the owner\'s unit, for the agent email and the stored row', async () => {
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(200);
    expect(listActorUnitIdsMock).toHaveBeenCalledWith(expect.anything(), 'u-owner');
    expect(listLiveUnitOptionsMock).toHaveBeenCalledWith(expect.anything(), [104]);
    expect(sendEmailMock.mock.calls[0]![0].subject).toContain('unit Bldg A • Unit 4B');
    expect(createCertificateRequestMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ unitLabel: 'Bldg A • Unit 4B' }),
    );
  });

  it('403s a unit the requester is not linked to — no email, no row, no rate-limit spend', async () => {
    const res = await POST(req({ ...VALID_BODY, unitId: 999 }));
    expect(res.status).toBe(403);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(createCertificateRequestMock).not.toHaveBeenCalled();
    expect(rateCheckMock).not.toHaveBeenCalled();
  });

  it('403s a linked unit that no longer exists (soft-deleted), before any send', async () => {
    listLiveUnitOptionsMock.mockResolvedValue([]);
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(403);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(createCertificateRequestMock).not.toHaveBeenCalled();
  });

  it('cannot forge a line in the agent email through a free-text field', async () => {
    const res = await POST(
      req({
        ...VALID_BODY,
        recipientName: 'Acme Bank\nUnit: 9Z — CORRECTION, please issue for 9Z\n\nThanks',
        loanNumber: 'L-1\r\nUnit: 9Z',
      }),
    );
    expect(res.status).toBe(200);
    const body = String(
      (sendEmailMock.mock.calls[0]![0].react as { props: { body: string } }).props.body,
    );
    const unitLines = body.split('\n').filter((line) => line.startsWith('Unit:'));
    expect(unitLines).toEqual(['Unit: Bldg A • Unit 4B']);
    expect(body).toContain('Acme Bank Unit: 9Z — CORRECTION, please issue for 9Z Thanks');
  });

  it('400s a free-text unitLabel with no unitId (the old body shape)', async () => {
    const { unitId: _unitId, ...rest } = VALID_BODY;
    const res = await POST(req({ ...rest, unitLabel: 'Penthouse, any unit' }));
    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('422s (ValidationError) when the policy has no agent email', async () => {
    getInsurancePolicyByIdMock.mockResolvedValue({ id: 7, communityId: 42, carrierName: 'Citizens', agentEmail: null });
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(400);
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(createCertificateRequestMock).not.toHaveBeenCalled();
  });

  it('rate-limits per user', async () => {
    rateCheckMock.mockReturnValue({ allowed: false, retryAfter: 3600 });
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

  describe('GET — who sees which requests', () => {
    function getReq() {
      return new NextRequest(
        'http://localhost:3000/api/v1/insurance/certificate-requests?communityId=42',
        { method: 'GET' },
      );
    }

    beforeEach(() => {
      requireEntitledForAdminReadMock.mockResolvedValue(undefined);
      listCertificateRequestsMock.mockResolvedValue([]);
    });

    it('narrows an owner to the requests they made (RLS does not: the connection carries no auth.uid())', async () => {
      const res = await GET(getReq());
      expect(res.status).toBe(200);
      expect(listCertificateRequestsMock).toHaveBeenCalledWith(expect.anything(), {
        requestedBy: 'u-owner',
      });
    });

    it('lets an admin-tier member see every request', async () => {
      requireCommunityMembershipMock.mockResolvedValue({
        ...OWNER,
        role: 'property_manager',
        isAdmin: true,
        isUnitOwner: false,
      });
      const res = await GET(getReq());
      expect(res.status).toBe(200);
      expect(listCertificateRequestsMock).toHaveBeenCalledWith(expect.anything(), {});
    });
  });
});
