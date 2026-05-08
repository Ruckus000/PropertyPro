/**
 * Unit tests for `/api/v1/esign/templates` GET — locks in the
 * `safeParse + ValidationError` enum-validation contract from #232 (status
 * AND type filters) and the happy-path response shape.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  listTemplatesMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  requireEsignReadPermissionMock,
  parseCommunityIdFromQueryMock,
} = vi.hoisted(() => ({
  listTemplatesMock: vi.fn(),
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
  createTemplate: vi.fn(),
  listTemplates: listTemplatesMock,
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

import { GET } from '../../src/app/api/v1/esign/templates/route';

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

describe('GET /api/v1/esign/templates', () => {
  it('returns the listTemplates result wrapped in { data }', async () => {
    const rows = [{ id: 1, status: 'active', type: 'proxy' }];
    listTemplatesMock.mockResolvedValueOnce(rows);

    const response = await GET(makeRequest(`/api/v1/esign/templates?communityId=${COMMUNITY_ID}`));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ data: rows });
    expect(listTemplatesMock).toHaveBeenCalledWith(COMMUNITY_ID, {
      status: undefined,
      type: undefined,
    });
  });

  it('passes valid status + type filters through to listTemplates', async () => {
    listTemplatesMock.mockResolvedValueOnce([]);

    await GET(
      makeRequest(
        `/api/v1/esign/templates?communityId=${COMMUNITY_ID}&status=active&type=proxy`,
      ),
    );

    expect(listTemplatesMock).toHaveBeenCalledWith(COMMUNITY_ID, {
      status: 'active',
      type: 'proxy',
    });
  });

  it('rejects an invalid status with ValidationError (400, not 500) — #232 contract', async () => {
    await expect(
      GET(makeRequest(`/api/v1/esign/templates?communityId=${COMMUNITY_ID}&status=nope`)),
    ).rejects.toThrow('Invalid status filter');
    expect(listTemplatesMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid type with ValidationError (400, not 500) — #232 contract', async () => {
    await expect(
      GET(makeRequest(`/api/v1/esign/templates?communityId=${COMMUNITY_ID}&type=garbage`)),
    ).rejects.toThrow('Invalid type filter');
    expect(listTemplatesMock).not.toHaveBeenCalled();
  });

  it('lists accepted status values in the ValidationError details', async () => {
    let caught: Error & { details?: { fields?: Array<{ field: string; message: string }> } } | null = null;
    try {
      await GET(makeRequest(`/api/v1/esign/templates?communityId=${COMMUNITY_ID}&status=nope`));
    } catch (err) {
      caught = err as typeof caught;
    }
    expect(caught?.details?.fields?.[0]?.field).toBe('status');
    const msg = caught?.details?.fields?.[0]?.message ?? '';
    expect(msg).toMatch(/active/);
    expect(msg).toMatch(/archived/);
  });

  it('lists accepted type values in the ValidationError details', async () => {
    let caught: Error & { details?: { fields?: Array<{ field: string; message: string }> } } | null = null;
    try {
      await GET(makeRequest(`/api/v1/esign/templates?communityId=${COMMUNITY_ID}&type=garbage`));
    } catch (err) {
      caught = err as typeof caught;
    }
    expect(caught?.details?.fields?.[0]?.field).toBe('type');
    const msg = caught?.details?.fields?.[0]?.message ?? '';
    for (const t of ['proxy', 'consent', 'lease_addendum', 'maintenance_auth', 'custom']) {
      expect(msg).toMatch(new RegExp(t));
    }
  });

  it('validates status before type — only one error surfaces if both are invalid', async () => {
    await expect(
      GET(
        makeRequest(
          `/api/v1/esign/templates?communityId=${COMMUNITY_ID}&status=nope&type=garbage`,
        ),
      ),
    ).rejects.toThrow('Invalid status filter');
    expect(listTemplatesMock).not.toHaveBeenCalled();
  });
});
