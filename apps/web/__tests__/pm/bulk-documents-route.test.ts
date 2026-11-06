import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { UnprocessableEntityError } from '../../src/lib/api/errors';

const {
  requireAuthenticatedUserIdMock,
  isPmAdminInAnyCommunityMock,
  findManagedCommunitiesPortfolioUnscopedMock,
  assertNotDemoGraceMock,
  insertBulkDocumentsForCommunityMock,
  readValidatedUploadMock,
  requireActiveSubscriptionForMutationMock,
} = vi.hoisted(() => ({
  requireAuthenticatedUserIdMock: vi.fn(),
  isPmAdminInAnyCommunityMock: vi.fn(),
  findManagedCommunitiesPortfolioUnscopedMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
  insertBulkDocumentsForCommunityMock: vi.fn(),
  readValidatedUploadMock: vi.fn(),
  requireActiveSubscriptionForMutationMock: vi.fn(),
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@propertypro/db/unsafe', () => ({
  isPmAdminInAnyCommunity: isPmAdminInAnyCommunityMock,
  findManagedCommunitiesPortfolioUnscoped: findManagedCommunitiesPortfolioUnscopedMock,
}));

// The REAL storage-path validator runs here (it is the point of the path
// tests); it only needs these two storage functions to load.
vi.mock('@propertypro/db', () => ({
  downloadStorageObject: vi.fn(),
  deleteStorageObject: vi.fn(),
}));

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

vi.mock('@/lib/pm/bulk-document-upload', () => ({
  insertBulkDocumentsForCommunity: insertBulkDocumentsForCommunityMock,
}));

vi.mock('@/lib/middleware/subscription-guard', () => ({
  requireActiveSubscriptionForMutation: requireActiveSubscriptionForMutationMock,
}));

vi.mock('@/lib/documents/create-uploaded-document', () => ({
  readValidatedUpload: readValidatedUploadMock,
}));

const MEASURED = { byteLength: 2048, mime: 'application/pdf' };

import { POST } from '../../src/app/api/v1/pm/bulk/documents/route';

const URL = 'http://localhost:3000/api/v1/pm/bulk/documents';

const validBody = {
  communityIds: [10, 11],
  redactionAttested: true,
  documents: [
    {
      fileName: 'budget.pdf',
      storagePath: 'communities/10/documents/budget.pdf',
      fileSize: 2048,
      description: 'Annual budget',
    },
  ],
};

function postWithPath(storagePath: string) {
  return POST(
    new NextRequest(URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...validBody,
        documents: [{ ...validBody.documents[0], storagePath }],
      }),
    }),
  );
}

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
    readValidatedUploadMock.mockResolvedValue(MEASURED);
    requireActiveSubscriptionForMutationMock.mockResolvedValue(undefined);
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
    expect(insertBulkDocumentsForCommunityMock).toHaveBeenCalledWith({
      communityId: 11,
      uploadedBy: 'pm-user-1',
      docs: [{ ...validBody.documents[0], measured: MEASURED }],
    });
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(10);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(11);
  });

  it('reads each file once, before any community is written, for every community to share', async () => {
    await postWithPath('communities/10/documents/u-1/budget.pdf');

    expect(readValidatedUploadMock).toHaveBeenCalledTimes(1);
    expect(readValidatedUploadMock).toHaveBeenCalledWith({
      userId: 'pm-user-1',
      communityId: 10,
      filePath: 'communities/10/documents/u-1/budget.pdf',
      fileName: 'budget.pdf',
      fileSize: 2048,
    });
    expect(readValidatedUploadMock.mock.invocationCallOrder[0]).toBeLessThan(
      insertBulkDocumentsForCommunityMock.mock.invocationCallOrder[0]!,
    );
  });

  // The same write gate as the single upload: a lapsed community gets no rows.
  it('reports a community without an active subscription as failed and writes nothing there', async () => {
    requireActiveSubscriptionForMutationMock.mockImplementation(async (id: number) => {
      if (id === 11) throw new ForbiddenError('Your subscription is not active.');
    });

    const response = await postWithPath('communities/10/documents/u-1/budget.pdf');
    const json = await response.json();

    expect(json.data.results[1]).toEqual({
      communityId: 11,
      communityName: 'Beta HOA',
      status: 'failed',
      error: 'Your subscription is not active.',
    });
    expect(insertBulkDocumentsForCommunityMock).toHaveBeenCalledTimes(1);
    expect(insertBulkDocumentsForCommunityMock).toHaveBeenCalledWith(
      expect.objectContaining({ communityId: 10 }),
    );
  });

  it('a file that fails validation fails the request and writes nothing', async () => {
    readValidatedUploadMock.mockRejectedValueOnce(
      new UnprocessableEntityError('Uploaded file failed validation. Please retry your upload.'),
    );

    const response = await postWithPath('communities/10/documents/u-1/budget.pdf');

    expect(response.status).toBe(422);
    expect(insertBulkDocumentsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 without the redaction attestation, before reading or writing anything', async () => {
    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...validBody, redactionAttested: false }),
      }),
    );

    expect(response.status).toBe(400);
    expect(readValidatedUploadMock).not.toHaveBeenCalled();
    expect(insertBulkDocumentsForCommunityMock).not.toHaveBeenCalled();
  });

  // One upload is shared by every selected community, so its file may sit under
  // any of them — but only under them, and only in their `documents/` folder.
  it('accepts a file uploaded under any selected community', async () => {
    const response = await postWithPath('communities/11/documents/u-1/budget.pdf');

    expect(response.status).toBe(200);
    expect(insertBulkDocumentsForCommunityMock).toHaveBeenCalledTimes(2);
  });

  it('returns 400 and writes nothing for a file under a community the caller does not manage', async () => {
    const response = await postWithPath('communities/99/documents/u-1/minutes.pdf');
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.message).toBe('Storage path does not belong to a selected community.');
    expect(insertBulkDocumentsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a file under a managed community that was not selected', async () => {
    findManagedCommunitiesPortfolioUnscopedMock.mockResolvedValueOnce([
      { communityId: 10, communityName: 'Alpha Condos' },
      { communityId: 11, communityName: 'Beta HOA' },
      { communityId: 12, communityName: 'Gamma Villas' },
    ]);

    const response = await postWithPath('communities/12/documents/u-1/minutes.pdf');

    expect(response.status).toBe(400);
    expect(insertBulkDocumentsForCommunityMock).not.toHaveBeenCalled();
  });

  // Number('010') is 10, so the selected-community test alone would pass these;
  // the exact-prefix check behind it is what refuses them.
  it.each([
    'communities/010/documents/u-1/minutes.pdf',
    'communities/10/documents/./u-1/minutes.pdf',
  ])('returns 400 and reads nothing for a near-miss path: %s', async (storagePath) => {
    const response = await postWithPath(storagePath);

    expect(response.status).toBe(400);
    expect(readValidatedUploadMock).not.toHaveBeenCalled();
    expect(insertBulkDocumentsForCommunityMock).not.toHaveBeenCalled();
  });

  it('returns 400 for a selected community object outside its documents folder', async () => {
    const response = await postWithPath('communities/10/esign-signed/7/signed.pdf');
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error.message).toBe('Storage path does not belong to a selected community.');
    expect(insertBulkDocumentsForCommunityMock).not.toHaveBeenCalled();
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

  it('returns 403 under a support session and writes to no community', async () => {
    const response = await POST(
      new NextRequest(URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // As middleware stamps them for a session consented for community 10.
          'x-support-session-id': '42',
          'x-support-community-id': '10',
          'x-community-id': '10',
        },
        body: JSON.stringify(validBody),
      }),
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json.error.message).toBe('Not available during a support session');
    expect(findManagedCommunitiesPortfolioUnscopedMock).not.toHaveBeenCalled();
    expect(assertNotDemoGraceMock).not.toHaveBeenCalled();
    expect(insertBulkDocumentsForCommunityMock).not.toHaveBeenCalled();
  });
});
