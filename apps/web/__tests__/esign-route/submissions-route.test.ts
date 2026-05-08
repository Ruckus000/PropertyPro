/**
 * Unit tests for `/api/v1/esign/submissions` GET — locks in the
 * `safeParse + ValidationError` enum-validation contract from #232 and the
 * happy-path response shape.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  listSubmissionsMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireEsignReadPermissionMock,
  parseCommunityIdFromQueryMock,
} = vi.hoisted(() => ({
  listSubmissionsMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  requireEsignReadPermissionMock: vi.fn(),
  parseCommunityIdFromQueryMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/finance/request', () => ({
  parseCommunityIdFromQuery: parseCommunityIdFromQueryMock,
  parseCommunityIdFromBody: vi.fn(),
}));

vi.mock('@/lib/esign/esign-route-helpers', () => ({
  requireEsignReadPermission: requireEsignReadPermissionMock,
  requireEsignWritePermission: vi.fn(),
}));

vi.mock('@/lib/services/esign-service', () => ({
  createSubmission: vi.fn(),
  listSubmissions: listSubmissionsMock,
}));

vi.mock('@/lib/middleware/plan-guard', () => ({
  requirePlanFeature: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));

vi.mock('@/lib/api/errors', () => ({
  ValidationError: class ValidationError extends Error {
    details?: Record<string, unknown>;
    constructor(msg: string, details?: Record<string, unknown>) {
      super(msg);
      this.name = 'ValidationError';
      this.details = details;
    }
  },
}));

vi.mock('@/lib/api/zod/error-formatter', () => ({
  formatZodErrors: vi.fn(() => []),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

import { GET } from '../../src/app/api/v1/esign/submissions/route';

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
  requireCommunityMembershipMock.mockResolvedValue(membership);
  requireEsignReadPermissionMock.mockResolvedValue(undefined);
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
    await expect(
      GET(makeRequest(`/api/v1/esign/submissions?communityId=${COMMUNITY_ID}&status=garbage`)),
    ).rejects.toThrow('Invalid status filter');
    expect(listSubmissionsMock).not.toHaveBeenCalled();
  });

  it('lists all accepted status values in the ValidationError details — #232 contract', async () => {
    let caught: Error & { details?: { fields?: Array<{ field: string; message: string }> } } | null = null;
    try {
      await GET(
        makeRequest(`/api/v1/esign/submissions?communityId=${COMMUNITY_ID}&status=garbage`),
      );
    } catch (err) {
      caught = err as typeof caught;
    }
    expect(caught).toBeInstanceOf(Error);
    expect(caught?.details?.fields?.[0]?.field).toBe('status');
    const fieldMessage = caught?.details?.fields?.[0]?.message ?? '';
    // Spot-check well-known statuses are listed; exact string would over-pin.
    for (const s of ['pending', 'processing', 'completed', 'declined', 'expired']) {
      expect(fieldMessage).toMatch(new RegExp(s));
    }
  });
});
