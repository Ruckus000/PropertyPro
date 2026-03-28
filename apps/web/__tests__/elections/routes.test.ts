import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  assertNotDemoGraceMock,
  parsePositiveIntMock,
  parseCommunityIdFromBodyMock,
  parseCommunityIdFromQueryMock,
  requireElectionsEnabledMock,
  requireElectionsReadPermissionMock,
  requireElectionsWritePermissionMock,
  getMyVoteReceiptForCommunityMock,
  castElectionVoteForCommunityMock,
  openElectionForCommunityMock,
  closeElectionForCommunityMock,
  certifyElectionForCommunityMock,
  cancelElectionForCommunityMock,
  approveElectionProxyForCommunityMock,
  rejectElectionProxyForCommunityMock,
  revokeElectionProxyForCommunityMock,
  snapshotElectionEligibilityForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn().mockResolvedValue(undefined),
  parsePositiveIntMock: vi.fn((value: string) => Number(value)),
  parseCommunityIdFromBodyMock: vi.fn((_req: Request, communityId: number) => communityId),
  parseCommunityIdFromQueryMock: vi.fn(() => 42),
  requireElectionsEnabledMock: vi.fn(),
  requireElectionsReadPermissionMock: vi.fn(),
  requireElectionsWritePermissionMock: vi.fn(),
  getMyVoteReceiptForCommunityMock: vi.fn(),
  castElectionVoteForCommunityMock: vi.fn(),
  openElectionForCommunityMock: vi.fn(),
  closeElectionForCommunityMock: vi.fn(),
  certifyElectionForCommunityMock: vi.fn(),
  cancelElectionForCommunityMock: vi.fn(),
  approveElectionProxyForCommunityMock: vi.fn(),
  rejectElectionProxyForCommunityMock: vi.fn(),
  revokeElectionProxyForCommunityMock: vi.fn(),
  snapshotElectionEligibilityForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/finance/common', () => ({
  parsePositiveInt: parsePositiveIntMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
}));

vi.mock('@/lib/elections/common', () => ({
  requireElectionsEnabled: requireElectionsEnabledMock,
  requireElectionsReadPermission: requireElectionsReadPermissionMock,
  requireElectionsWritePermission: requireElectionsWritePermissionMock,
  requireElectionsAdminRole: vi.fn(),
}));

vi.mock('@/lib/services/elections-service', () => ({
  getMyElectionVoteReceiptForCommunity: getMyVoteReceiptForCommunityMock,
  castElectionVoteForCommunity: castElectionVoteForCommunityMock,
  openElectionForCommunity: openElectionForCommunityMock,
  closeElectionForCommunity: closeElectionForCommunityMock,
  certifyElectionForCommunity: certifyElectionForCommunityMock,
  cancelElectionForCommunity: cancelElectionForCommunityMock,
  approveElectionProxyForCommunity: approveElectionProxyForCommunityMock,
  rejectElectionProxyForCommunity: rejectElectionProxyForCommunityMock,
  revokeElectionProxyForCommunity: revokeElectionProxyForCommunityMock,
  snapshotElectionEligibilityForCommunity: snapshotElectionEligibilityForCommunityMock,
}));

import { GET as getMyVote } from '../../src/app/api/v1/elections/[id]/my-vote/route';
import { POST as postVote } from '../../src/app/api/v1/elections/[id]/vote/route';
import { POST as postOpen } from '../../src/app/api/v1/elections/[id]/open/route';
import { POST as postClose } from '../../src/app/api/v1/elections/[id]/close/route';
import { POST as postCertify } from '../../src/app/api/v1/elections/[id]/certify/route';
import { POST as postCancel } from '../../src/app/api/v1/elections/[id]/cancel/route';
import { POST as postProxyApprove } from '../../src/app/api/v1/elections/[id]/proxies/[proxyId]/approve/route';
import { POST as postProxyReject } from '../../src/app/api/v1/elections/[id]/proxies/[proxyId]/reject/route';
import { POST as postProxyRevoke } from '../../src/app/api/v1/elections/[id]/proxies/[proxyId]/revoke/route';
import { POST as postEligibilitySnapshot } from '../../src/app/api/v1/elections/[id]/eligibility/route';

describe('elections routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    parseCommunityIdFromQueryMock.mockReturnValue(42);
    parsePositiveIntMock.mockImplementation((value: string) => Number(value));
    parseCommunityIdFromBodyMock.mockImplementation((_req: Request, communityId: number) => communityId);
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'resident',
      communityType: 'condo_718',
      isUnitOwner: true,
      isAdmin: false,
      electionsAttorneyReviewed: true,
    });
  });

  it('returns the current actor receipt from my-vote', async () => {
    getMyVoteReceiptForCommunityMock.mockResolvedValue({
      hasVoted: true,
      submittedAt: '2026-03-27T14:00:00.000Z',
      submissionFingerprint: 'fp-1',
      viaProxy: false,
      electionStatus: 'open',
    });

    const req = new NextRequest('http://localhost:3000/api/v1/elections/15/my-vote?communityId=42&unitId=7');
    const res = await getMyVote(req, { params: Promise.resolve({ id: '15' }) });

    expect(res.status).toBe(200);
    expect(getMyVoteReceiptForCommunityMock).toHaveBeenCalledWith(42, 15, 'user-1');
    expect(requireElectionsEnabledMock).toHaveBeenCalledTimes(1);
    expect(requireElectionsReadPermissionMock).toHaveBeenCalledTimes(1);
  });

  it('submits an election vote through the canonical POST route', async () => {
    castElectionVoteForCommunityMock.mockResolvedValue({
      submissionId: 91,
      hasVoted: true,
      submittedAt: '2026-03-27T14:00:00.000Z',
      submissionFingerprint: 'fp-2',
      viaProxy: false,
      electionStatus: 'open',
    });

    const req = new NextRequest('http://localhost:3000/api/v1/elections/15/vote', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-1',
      },
      body: JSON.stringify({
        communityId: 42,
        selectedCandidateIds: [1001, 1002],
      }),
    });

    const res = await postVote(req, { params: Promise.resolve({ id: '15' }) });

    expect(res.status).toBe(201);
    expect(castElectionVoteForCommunityMock).toHaveBeenCalledWith(
      42,
      15,
      'user-1',
      {
        selectedCandidateIds: [1001, 1002],
        isAbstention: undefined,
        proxyId: null,
        unitId: null,
      },
      'req-1',
    );
    expect(requireElectionsWritePermissionMock).toHaveBeenCalledTimes(1);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
  });

  it('opens an election through the admin transition route', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'manager',
      communityType: 'condo_718',
      isUnitOwner: false,
      isAdmin: true,
      electionsAttorneyReviewed: true,
    });
    openElectionForCommunityMock.mockResolvedValue({
      electionId: 15,
      status: 'open',
      certifiedAt: null,
      resultsDocumentId: null,
      canceledReason: null,
      changed: true,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/elections/15/open', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-2',
      },
      body: JSON.stringify({ communityId: 42 }),
    });

    const res = await postOpen(req, { params: Promise.resolve({ id: '15' }) });

    expect(res.status).toBe(200);
    expect(openElectionForCommunityMock).toHaveBeenCalledWith(42, 15, 'user-1', 'req-2');
  });

  it('routes proxy review decisions to approve and reject handlers', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'manager',
      communityType: 'condo_718',
      isUnitOwner: false,
      isAdmin: true,
      electionsAttorneyReviewed: true,
    });
    approveElectionProxyForCommunityMock.mockResolvedValue({
      id: 8,
      electionId: 15,
      status: 'approved',
      approvedAt: '2026-03-27T14:00:00.000Z',
    });
    rejectElectionProxyForCommunityMock.mockResolvedValue({
      id: 8,
      electionId: 15,
      status: 'rejected',
      approvedAt: null,
    });

    const approveReq = new NextRequest('http://localhost:3000/api/v1/elections/15/proxies/8/approve', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-3',
      },
      body: JSON.stringify({ communityId: 42 }),
    });

    const approveRes = await postProxyApprove(approveReq, {
      params: Promise.resolve({ id: '15', proxyId: '8' }),
    });

    expect(approveRes.status).toBe(200);
    expect(approveElectionProxyForCommunityMock).toHaveBeenCalledWith(42, 15, 8, 'user-1', 'req-3');

    const rejectReq = new NextRequest('http://localhost:3000/api/v1/elections/15/proxies/8/reject', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-4',
      },
      body: JSON.stringify({ communityId: 42 }),
    });

    const rejectRes = await postProxyReject(rejectReq, {
      params: Promise.resolve({ id: '15', proxyId: '8' }),
    });

    expect(rejectRes.status).toBe(200);
    expect(rejectElectionProxyForCommunityMock).toHaveBeenCalledWith(42, 15, 8, 'user-1', 'req-4');
  });

  it('allows proxy revocation and manual eligibility snapshots through their POST routes', async () => {
    revokeElectionProxyForCommunityMock.mockResolvedValue({
      id: 8,
      electionId: 15,
      status: 'revoked',
      approvedAt: null,
    });
    snapshotElectionEligibilityForCommunityMock.mockResolvedValue({
      electionId: 15,
      eligibleUnitCount: 18,
      insertedCount: 18,
      snapshotTakenAt: '2026-03-27T14:00:00.000Z',
    });

    const revokeReq = new NextRequest('http://localhost:3000/api/v1/elections/15/proxies/8/revoke', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-5',
      },
      body: JSON.stringify({ communityId: 42 }),
    });

    const revokeRes = await postProxyRevoke(revokeReq, {
      params: Promise.resolve({ id: '15', proxyId: '8' }),
    });

    expect(revokeRes.status).toBe(200);
    expect(revokeElectionProxyForCommunityMock).toHaveBeenCalledWith(42, 15, 8, 'user-1', false, 'req-5');

    requireCommunityMembershipMock.mockResolvedValue({
      role: 'manager',
      communityType: 'condo_718',
      isUnitOwner: false,
      isAdmin: true,
      electionsAttorneyReviewed: true,
    });

    const snapshotReq = new NextRequest('http://localhost:3000/api/v1/elections/15/eligibility', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-6',
      },
      body: JSON.stringify({ communityId: 42 }),
    });

    const snapshotRes = await postEligibilitySnapshot(snapshotReq, {
      params: Promise.resolve({ id: '15' }),
    });

    expect(snapshotRes.status).toBe(201);
    expect(snapshotElectionEligibilityForCommunityMock).toHaveBeenCalledWith(42, 15, 'user-1', 'req-6');
  });

  it('closes an election through the admin transition route', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'manager',
      communityType: 'condo_718',
      isUnitOwner: false,
      isAdmin: true,
      electionsAttorneyReviewed: true,
    });
    closeElectionForCommunityMock.mockResolvedValue({
      electionId: 15,
      status: 'closed',
      certifiedAt: null,
      resultsDocumentId: null,
      canceledReason: null,
      changed: true,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/elections/15/close', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-close',
      },
      body: JSON.stringify({ communityId: 42 }),
    });

    const res = await postClose(req, { params: Promise.resolve({ id: '15' }) });

    expect(res.status).toBe(200);
    expect(closeElectionForCommunityMock).toHaveBeenCalledWith(42, 15, 'user-1', 'req-close');
    const body = await res.json();
    expect(body).toHaveProperty('data');
  });

  it('certifies an election with a resultsDocumentId', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'manager',
      communityType: 'condo_718',
      isUnitOwner: false,
      isAdmin: true,
      electionsAttorneyReviewed: true,
    });
    certifyElectionForCommunityMock.mockResolvedValue({
      electionId: 15,
      status: 'certified',
      certifiedAt: '2026-03-27T14:00:00.000Z',
      resultsDocumentId: 99,
      canceledReason: null,
      changed: true,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/elections/15/certify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-certify-1',
      },
      body: JSON.stringify({ communityId: 42, resultsDocumentId: 99 }),
    });

    const res = await postCertify(req, { params: Promise.resolve({ id: '15' }) });

    expect(res.status).toBe(200);
    expect(certifyElectionForCommunityMock).toHaveBeenCalledWith(
      42,
      15,
      'user-1',
      { resultsDocumentId: 99 },
      'req-certify-1',
    );
    const body = await res.json();
    expect(body).toHaveProperty('data');
  });

  it('certifies an election without a resultsDocumentId', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'manager',
      communityType: 'condo_718',
      isUnitOwner: false,
      isAdmin: true,
      electionsAttorneyReviewed: true,
    });
    certifyElectionForCommunityMock.mockResolvedValue({
      electionId: 15,
      status: 'certified',
      certifiedAt: '2026-03-27T14:00:00.000Z',
      resultsDocumentId: null,
      canceledReason: null,
      changed: true,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/elections/15/certify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-certify-2',
      },
      body: JSON.stringify({ communityId: 42 }),
    });

    const res = await postCertify(req, { params: Promise.resolve({ id: '15' }) });

    expect(res.status).toBe(200);
    expect(certifyElectionForCommunityMock).toHaveBeenCalledWith(
      42,
      15,
      'user-1',
      { resultsDocumentId: null },
      'req-certify-2',
    );
    const body = await res.json();
    expect(body).toHaveProperty('data');
  });

  it('cancels an election with a canceledReason', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'manager',
      communityType: 'condo_718',
      isUnitOwner: false,
      isAdmin: true,
      electionsAttorneyReviewed: true,
    });
    cancelElectionForCommunityMock.mockResolvedValue({
      electionId: 15,
      status: 'canceled',
      certifiedAt: null,
      resultsDocumentId: null,
      canceledReason: 'Insufficient candidates',
      changed: true,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/elections/15/cancel', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-cancel',
      },
      body: JSON.stringify({ communityId: 42, canceledReason: 'Insufficient candidates' }),
    });

    const res = await postCancel(req, { params: Promise.resolve({ id: '15' }) });

    expect(res.status).toBe(200);
    expect(cancelElectionForCommunityMock).toHaveBeenCalledWith(
      42,
      15,
      'user-1',
      { canceledReason: 'Insufficient candidates' },
      'req-cancel',
    );
    const body = await res.json();
    expect(body).toHaveProperty('data');
  });

  it('rejects a cancel request missing canceledReason with a 400', async () => {
    requireCommunityMembershipMock.mockResolvedValue({
      role: 'manager',
      communityType: 'condo_718',
      isUnitOwner: false,
      isAdmin: true,
      electionsAttorneyReviewed: true,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/elections/15/cancel', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-request-id': 'req-cancel-invalid',
      },
      body: JSON.stringify({ communityId: 42 }),
    });

    const res = await postCancel(req, { params: Promise.resolve({ id: '15' }) });

    expect(res.status).toBe(400);
    expect(cancelElectionForCommunityMock).not.toHaveBeenCalled();
  });
});
