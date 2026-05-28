/**
 * Unit tests for `/api/v1/esign/submissions` GET — locks in the
 * `safeParse + ValidationError` enum-validation contract from #232 and the
 * happy-path response shape.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  listSubmissionsMock,
  createSubmissionMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireEsignReadPermissionMock,
  requireEsignWritePermissionMock,
  parseCommunityIdFromQueryMock,
  parseCommunityIdFromBodyMock,
} = vi.hoisted(() => ({
  listSubmissionsMock: vi.fn(),
  createSubmissionMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireEsignReadPermissionMock: vi.fn(),
  requireEsignWritePermissionMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
  parseCommunityIdFromBodyMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
  parseCommunityIdFromBody: parseCommunityIdFromBodyMock,
}));

vi.mock('@/lib/esign/esign-route-helpers', () => ({
  requireEsignReadPermission: requireEsignReadPermissionMock,
  requireEsignWritePermission: requireEsignWritePermissionMock,
}));

vi.mock('@/lib/services/esign-service', () => ({
  createSubmission: createSubmissionMock,
  listSubmissions: listSubmissionsMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));


vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

import { GET, POST } from '../../src/app/api/v1/esign/submissions/route';

function makeRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

const COMMUNITY_ID = 99;

const membership = {
  userId: 'user-staff',
  communityId: COMMUNITY_ID,
  role: 'cam',
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718',
};

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-staff');
  parseCommunityIdFromQueryMock.mockReturnValue(COMMUNITY_ID);
  parseCommunityIdFromBodyMock.mockReturnValue(COMMUNITY_ID);
  requireCommunityMembershipMock.mockResolvedValue(membership);
  requireEsignReadPermissionMock.mockResolvedValue(undefined);
  requireEsignWritePermissionMock.mockResolvedValue(undefined);
});

describe('GET /api/v1/esign/submissions', () => {
  it('returns the listSubmissions result wrapped in { data }', async () => {
    const rows = [{ id: 1, status: 'pending' }, { id: 2, status: 'completed' }];
    listSubmissionsMock.mockResolvedValueOnce(rows);

    const response = await GET(makeRequest(`/api/v1/esign/submissions?communityId=${COMMUNITY_ID}`));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ data: rows });
    expect(listSubmissionsMock).toHaveBeenCalledWith(COMMUNITY_ID, { status: undefined });
  });

  it('passes a valid status filter through to listSubmissions', async () => {
    listSubmissionsMock.mockResolvedValueOnce([]);

    await GET(
      makeRequest(`/api/v1/esign/submissions?communityId=${COMMUNITY_ID}&status=pending`),
    );

    expect(listSubmissionsMock).toHaveBeenCalledWith(COMMUNITY_ID, { status: 'pending' });
  });

  it('rejects an invalid status with ValidationError (400, not 500) — #232 contract', async () => {
    const response = await GET(
      makeRequest(`/api/v1/esign/submissions?communityId=${COMMUNITY_ID}&status=garbage`),
    );
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.message).toBe('Invalid status filter');
    expect(listSubmissionsMock).not.toHaveBeenCalled();
  });

  it('lists all accepted status values in the ValidationError details — #232 contract', async () => {
    const response = await GET(
      makeRequest(`/api/v1/esign/submissions?communityId=${COMMUNITY_ID}&status=garbage`),
    );
    const json = await response.json();
    const fieldMessage = json.error?.details?.fields?.[0]?.message ?? '';
    expect(json.error?.details?.fields?.[0]?.field).toBe('status');
    for (const s of ['pending', 'processing', 'completed', 'declined', 'expired']) {
      expect(fieldMessage).toMatch(new RegExp(s));
    }
  });
});

const CREATE_BODY = {
  communityId: COMMUNITY_ID,
  templateId: 3,
  signers: [{
    email: 'signer@example.com',
    name: 'Signer',
    role: 'owner',
    sortOrder: 0,
  }],
  signingOrder: 'parallel' as const,
  sendEmail: true,
};

describe('POST /api/v1/esign/submissions', () => {
  beforeEach(() => {
    createSubmissionMock.mockResolvedValue({ id: 12, status: 'pending' });
  });

  it('creates submission and returns { data }', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/esign/submissions', {
      method: 'POST',
      body: JSON.stringify(CREATE_BODY),
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-1' },
    });
    const response = await POST(req);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ data: { id: 12, status: 'pending' } });
    expect(createSubmissionMock).toHaveBeenCalledWith(
      COMMUNITY_ID,
      'user-staff',
      expect.objectContaining({ templateId: 3, signingOrder: 'parallel' }),
      'req-1',
    );
  });

  it('rejects invalid body via contract validation', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/esign/submissions', {
      method: 'POST',
      body: JSON.stringify({ communityId: COMMUNITY_ID }),
      headers: { 'content-type': 'application/json' },
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
    expect(createSubmissionMock).not.toHaveBeenCalled();
  });
});

