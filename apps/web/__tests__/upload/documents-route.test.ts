import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  createScopedClientMock,
  createPresignedDownloadUrlMock,
  logAuditEventMock,
  scopedInsertMock,
  scopedQueryMock,
  documentsTable,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  queuePdfExtractionMock,
} = vi.hoisted(() => ({
  createScopedClientMock: vi.fn(),
  createPresignedDownloadUrlMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
  scopedInsertMock: vi.fn(),
  scopedQueryMock: vi.fn(),
  documentsTable: Symbol('documents'),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn().mockResolvedValue(undefined),
  queuePdfExtractionMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createScopedClient: createScopedClientMock,
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
  documents: documentsTable,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

vi.mock('@/lib/api/community-membership', () => ({
  requireCommunityMembership: requireCommunityMembershipMock,
}));

vi.mock('@/lib/workers/pdf-extraction', () => ({
  queuePdfExtraction: queuePdfExtractionMock,
}));

import { GET, POST } from '../../src/app/api/v1/documents/route';

describe('p1-11 documents route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('95c454d2-9728-4f1f-8b75-5b9549fb9679');
    createPresignedDownloadUrlMock.mockResolvedValue('https://example.com/signed-download');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        const bytes = new Uint8Array(1024);
        bytes.set(new TextEncoder().encode('%PDF-'));
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => bytes.buffer,
        } as Response;
      }),
    );

    createScopedClientMock.mockReturnValue({
      insert: scopedInsertMock,
      query: scopedQueryMock,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POST creates document metadata with scoped client and audit log', async () => {
    scopedInsertMock.mockResolvedValue([
      {
        id: 99,
        communityId: 42,
        title: 'Board Minutes',
        filePath: 'communities/42/documents/abc/minutes.pdf',
      },
    ]);

    const req = new NextRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        title: 'Board Minutes',
        description: 'March meeting minutes',
        categoryId: null,
        filePath: 'communities/42/documents/abc/minutes.pdf',
        fileName: 'minutes.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    expect(createScopedClientMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(
      42,
      '95c454d2-9728-4f1f-8b75-5b9549fb9679',
    );
    expect(scopedInsertMock).toHaveBeenCalledWith(
      documentsTable,
      expect.objectContaining({
        title: 'Board Minutes',
        filePath: 'communities/42/documents/abc/minutes.pdf',
      }),
    );

    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'create',
        resourceType: 'document',
        communityId: 42,
      }),
    );
  });

  it('GET lists documents scoped by communityId', async () => {
    scopedQueryMock.mockResolvedValue([
      { id: 1, communityId: 8, title: 'A' },
      { id: 2, communityId: 8, title: 'B' },
    ]);

    const req = new NextRequest('http://localhost:3000/api/v1/documents?communityId=8');
    const res = await GET(req);
    const json = (await res.json()) as {
      data: Array<{ id: number }>;
    };

    expect(res.status).toBe(200);
    expect(createScopedClientMock).toHaveBeenCalledWith(8);
    expect(scopedQueryMock).toHaveBeenCalledWith(documentsTable);
    expect(json.data).toHaveLength(2);
  });

  it('POST rejects unauthenticated requests', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        title: 'Board Minutes',
        filePath: 'communities/42/documents/abc/minutes.pdf',
        fileName: 'minutes.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('POST returns 403 for authenticated non-member', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(new ForbiddenError());

    const req = new NextRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        title: 'Board Minutes',
        filePath: 'communities/42/documents/abc/minutes.pdf',
        fileName: 'minutes.pdf',
        fileSize: 1024,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
  });

  it('POST rejects size mismatch between payload and stored object', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/documents', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        title: 'Board Minutes',
        filePath: 'communities/42/documents/abc/minutes.pdf',
        fileName: 'minutes.pdf',
        fileSize: 2048,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
