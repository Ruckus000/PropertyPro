import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  isPmAdminInAnyCommunityMock,
  findManagedCommunitiesPortfolioUnscopedMock,
  assertNotDemoGraceMock,
  insertBulkDocumentsForCommunityMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  isPmAdminInAnyCommunityMock: vi.fn(),
  findManagedCommunitiesPortfolioUnscopedMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  insertBulkDocumentsForCommunityMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  isPmAdminInAnyCommunity: isPmAdminInAnyCommunityMock,
  findManagedCommunitiesPortfolioUnscoped: findManagedCommunitiesPortfolioUnscopedMock,
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/pm/bulk-document-upload', () => ({
  insertBulkDocumentsForCommunity: insertBulkDocumentsForCommunityMock,
}));

import { POST } from '../../src/app/api/v1/pm/bulk/documents/route';

const URL = 'http://localhost:3000/api/v1/pm/bulk/documents';

const validBody = {
  communityIds: [10, 11],
  documents: [
    {
      fileName: 'budget.pdf',
      storagePath: 'communities/10/documents/budget.pdf',
      description: 'Annual budget',
    },
  ],
};

describe('POST /api/v1/pm/bulk/documents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('pm-user-1');
    isPmAdminInAnyCommunityMock.mockResolvedValue(true);
    findManagedCommunitiesPortfolioUnscopedMock.mockResolvedValue([
      { communityId: 10, communityName: 'Alpha Condos' },
      { communityId: 11, communityName: 'Beta HOA' },
    ]);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    insertBulkDocumentsForCommunityMock.mockResolvedValue({ created: 1 });
  });

  it('creates document records for managed communities and returns results', async () => {
    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.results).toEqual([
      {
        communityId: 10,
        communityName: 'Alpha Condos',
        status: 'created',
        documentsCreated: 1,
      },
      {
        communityId: 11,
        communityName: 'Beta HOA',
        status: 'created',
        documentsCreated: 1,
      },
    ]);
    expect(insertBulkDocumentsForCommunityMock).toHaveBeenCalledTimes(2);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(10);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(11);
  });

  it('returns 401 without calling PM gate when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    );

    expect(response.status).toBe(401);
    expect(isPmAdminInAnyCommunityMock).not.toHaveBeenCalled();
    expect(findManagedCommunitiesPortfolioUnscopedMock).not.toHaveBeenCalled();
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(insertBulkDocumentsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when caller is not a PM admin', async () => {
    isPmAdminInAnyCommunityMock.mockResolvedValueOnce(false);

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    );

    expect(response.status).toBe(403);
    expect(isPmAdminInAnyCommunityMock).toHaveBeenCalledWith('pm-user-1');
    expect(findManagedCommunitiesPortfolioUnscopedMock).not.toHaveBeenCalled();
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(insertBulkDocumentsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 403 when communityIds include unmanaged communities', async () => {
    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...validBody, communityIds: [10, 99] }),
      }),
    );

    expect(response.status).toBe(403);
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(insertBulkDocumentsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid body without side effects', async () => {
    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ communityIds: [10] }),
      }),
    );

    expect(response.status).toBe(400);
    expect(requireAuthenticatedUserIdMock).not.toHaveBeenCalled();
    expect(insertBulkDocumentsForCommunityMock).not.toHaveBeenCalled();
  });

  it('maps per-community failures into failed results', async () => {
    insertBulkDocumentsForCommunityMock
      .mockResolvedValueOnce({ created: 1 })
      .mockRejectedValueOnce(new Error('DB constraint'));

    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data.results).toEqual([
      {
        communityId: 10,
        communityName: 'Alpha Condos',
        status: 'created',
        documentsCreated: 1,
      },
      {
        communityId: 11,
        communityName: 'Beta HOA',
        status: 'failed',
        error: 'DB constraint',
      },
    ]);
  });
});
