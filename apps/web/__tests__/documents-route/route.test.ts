/**
 * Unit tests for `/api/v1/documents` GET — paginate() integration (Plan B3).
 *
 * Covers:
 * - paginate() called with the correct table + scoped client + composed where
 * - `categoryId` filter forwarded into `buildAccessibleDocumentsFilter`
 * - cursor + pageSize forwarded
 * - Empty-string `?cursor=` / `?pageSize=` treated as missing (B3 lesson #5)
 * - communityId / categoryId param validation
 */
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const {
  paginateMock,
  scopedClient,
  createScopedClientMock,
  documentsTable,
  buildAccessibleDocumentsFilterMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
} = vi.hoisted(() => ({
  paginateMock: vi.fn(),
  scopedClient: { __scoped: true },
  createScopedClientMock: vi.fn(),
  documentsTable: {
    id: Symbol('documents.id'),
    categoryId: Symbol('documents.category_id'),
  },
  buildAccessibleDocumentsFilterMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  buildAccessibleDocumentsFilter: buildAccessibleDocumentsFilterMock,
  createScopedClient: createScopedClientMock,
  documents: documentsTable,
  logAuditEvent: vi.fn(),
  paginate: paginateMock,
}));

vi.mock('@propertypro/db/filters', () => ({
  eq: (col: unknown, val: unknown) => ({ __eq: { col, val } }),
}));

vi.mock('@propertypro/db/unsafe', () => ({
  createUnscopedClient: vi.fn(() => ({})),
}));

vi.mock('@propertypro/shared', () => ({
  isElevatedRole: vi.fn(() => true),
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

vi.mock('@/lib/db/access-control', () => ({
  requirePermission: vi.fn(),
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/documents/create-uploaded-document', () => ({
  createUploadedDocument: vi.fn(),
}));

vi.mock('@/lib/services/onboarding-checklist-service', () => ({
  tryAutoComplete: vi.fn(),
}));

vi.mock('@/lib/api/error-handler', () => ({
  withErrorHandler: (handler: unknown) => handler,
}));

vi.mock('@/lib/api/errors', () => ({
  ValidationError: class ValidationError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ValidationError';
    }
  },
  ForbiddenError: class ForbiddenError extends Error {
    constructor(msg: string) {
      super(msg);
      this.name = 'ForbiddenError';
    }
  },
}));

vi.mock('@/lib/api/zod/error-formatter', () => ({
  formatZodErrors: vi.fn(() => []),
}));

import { GET } from '../../src/app/api/v1/documents/route';

function makeRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'));
}

const COMMUNITY_ID = 99;

const elevatedMembership = {
  userId: 'user-staff',
  communityId: COMMUNITY_ID,
  role: 'cam',
  isAdmin: true,
  isUnitOwner: false,
  communityType: 'condo_718',
  permissions: undefined,
};

const ACCESS_FILTER = { __access: true };

beforeEach(() => {
  vi.clearAllMocks();
  requireAuthenticatedUserIdMock.mockResolvedValue('user-staff');
  resolveEffectiveCommunityIdMock.mockReturnValue(COMMUNITY_ID);
  requireCommunityMembershipMock.mockResolvedValue(elevatedMembership);
  buildAccessibleDocumentsFilterMock.mockResolvedValue(ACCESS_FILTER);
  createScopedClientMock.mockReturnValue(scopedClient);
});

describe('GET /api/v1/documents — paginate() integration', () => {
  it('returns paginated rows with combined access where', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [{ id: 1 }, { id: 2 }],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const response = await GET(makeRequest(`/api/v1/documents?communityId=${COMMUNITY_ID}`));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.data).toHaveLength(2);
    expect(json.data.pagination).toEqual({ nextCursor: null, hasMore: false, pageSize: 50 });

    // buildAccessibleDocumentsFilter called with the access context + no
    // additional categoryId filter.
    expect(buildAccessibleDocumentsFilterMock).toHaveBeenCalledWith(
      {
        communityId: COMMUNITY_ID,
        role: 'cam',
        communityType: 'condo_718',
        isUnitOwner: false,
        permissions: undefined,
      },
      undefined,
    );

    const [client, table, input, options] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
      { where?: unknown },
    ];
    expect(client).toBe(scopedClient);
    expect(table).toBe(documentsTable);
    expect(input).toEqual({ cursor: undefined, pageSize: undefined });
    expect(options.where).toBe(ACCESS_FILTER);
  });

  it('forwards categoryId as the additionalFilter argument', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    await GET(makeRequest(`/api/v1/documents?communityId=${COMMUNITY_ID}&categoryId=42`));

    expect(buildAccessibleDocumentsFilterMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: COMMUNITY_ID }),
      { __eq: { col: documentsTable.categoryId, val: 42 } },
    );
  });

  it('forwards cursor and pageSize to paginate()', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: 'next-opaque', hasMore: true, pageSize: 25 },
    });

    const response = await GET(
      makeRequest(`/api/v1/documents?communityId=${COMMUNITY_ID}&cursor=abc&pageSize=25`),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.pagination).toEqual({
      nextCursor: 'next-opaque',
      hasMore: true,
      pageSize: 25,
    });

    const [, , input] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
    ];
    expect(input).toEqual({ cursor: 'abc', pageSize: 25 });
  });

  it('treats empty-string ?cursor= and ?pageSize= as missing (B3 lesson #5)', async () => {
    paginateMock.mockResolvedValueOnce({
      data: [],
      pagination: { nextCursor: null, hasMore: false, pageSize: 50 },
    });

    const response = await GET(
      makeRequest(`/api/v1/documents?communityId=${COMMUNITY_ID}&cursor=&pageSize=`),
    );
    expect(response.status).toBe(200);

    const [, , input] = paginateMock.mock.calls[0] as [
      unknown,
      unknown,
      { cursor?: string; pageSize?: number },
    ];
    expect(input).toEqual({ cursor: undefined, pageSize: undefined });
  });

  it('rejects a missing communityId param with ValidationError', async () => {
    await expect(
      GET(makeRequest(`/api/v1/documents`)),
    ).rejects.toThrow('communityId query parameter is required');
    expect(paginateMock).not.toHaveBeenCalled();
  });

  it('rejects a non-positive categoryId with ValidationError', async () => {
    await expect(
      GET(makeRequest(`/api/v1/documents?communityId=${COMMUNITY_ID}&categoryId=-1`)),
    ).rejects.toThrow('categoryId query parameter must be a positive integer');
    expect(paginateMock).not.toHaveBeenCalled();
  });
});
