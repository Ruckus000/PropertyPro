import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { NotFoundError } from '../../src/lib/api/errors/NotFoundError';

const {
  resolveLibraryDocumentRequestMock,
  createPresignedDownloadUrlMock,
  logAuditEventMock,
} = vi.hoisted(() => ({
  resolveLibraryDocumentRequestMock: vi.fn(),
  createPresignedDownloadUrlMock: vi.fn(),
  logAuditEventMock: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/documents/library-document-resolver', () => ({
  resolveLibraryDocumentRequest: resolveLibraryDocumentRequestMock,
}));

import { GET } from '../../src/app/api/v1/documents/[id]/download/route';

describe('p1-15 document download route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPresignedDownloadUrlMock.mockResolvedValue('https://storage.example.com/signed-url');
    resolveLibraryDocumentRequestMock.mockRejectedValue(new NotFoundError('Document not found'));
  });

  it('returns signed URL for valid document', async () => {
    resolveLibraryDocumentRequestMock.mockResolvedValue({
      userId: 'user-123',
      communityId: 8,
      document: {
        id: 42,
        communityId: 8,
        title: 'Board Minutes',
        filePath: 'communities/8/documents/42/minutes.pdf',
        fileName: 'minutes.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
      },
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/42/download?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '42' }) };

    const res = await GET(req, context);
    const json = (await res.json()) as { data: { url: string; fileName: string } };

    expect(res.status).toBe(200);
    expect(json.data.url).toBe('https://storage.example.com/signed-url');
    expect(json.data.fileName).toBe('minutes.pdf');
    expect(createPresignedDownloadUrlMock).toHaveBeenCalledWith(
      'documents',
      'communities/8/documents/42/minutes.pdf',
      3600,
    );
  });

  it('redirects to signed URL when attachment=true', async () => {
    resolveLibraryDocumentRequestMock.mockResolvedValue({
      userId: 'user-123',
      communityId: 8,
      document: {
        id: 42,
        communityId: 8,
        title: 'Board Minutes',
        filePath: 'communities/8/documents/42/minutes.pdf',
        fileName: 'minutes.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
      },
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/42/download?communityId=8&attachment=true',
    );
    const context = { params: Promise.resolve({ id: '42' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://storage.example.com/signed-url');
  });

  it('returns 404 for non-existent document', async () => {
    resolveLibraryDocumentRequestMock.mockRejectedValueOnce(new NotFoundError('Document not found'));

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/999/download?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '999' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(404);
  });

  it('returns 401 for unauthenticated request', async () => {
    resolveLibraryDocumentRequestMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/42/download?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '42' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(401);
  });

  it('returns 403 for non-member', async () => {
    resolveLibraryDocumentRequestMock.mockRejectedValueOnce(
      new ForbiddenError('User is not a member of this community'),
    );

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/42/download?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '42' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(403);
  });

  it('validates communityId parameter', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/42/download?communityId=invalid',
    );
    const context = { params: Promise.resolve({ id: '42' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(400);
  });

  it('validates document ID', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/invalid/download?communityId=8',
    );
    const context = { params: Promise.resolve({ id: 'invalid' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(400);
  });

  it('logs document_accessed audit event on successful download', async () => {
    resolveLibraryDocumentRequestMock.mockResolvedValue({
      userId: 'user-123',
      communityId: 8,
      document: {
        id: 42,
        communityId: 8,
        title: 'Board Minutes',
        filePath: 'communities/8/documents/42/minutes.pdf',
        fileName: 'minutes.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
      },
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/42/download?communityId=8&attachment=true',
    );
    const context = { params: Promise.resolve({ id: '42' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(307);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        action: 'document_accessed',
        resourceType: 'document',
        resourceId: '42',
        communityId: 8,
        metadata: expect.objectContaining({
          accessType: 'download',
          fileName: 'minutes.pdf',
        }),
      }),
    );
  });

  it('does not log audit event when presigned URL generation fails', async () => {
    resolveLibraryDocumentRequestMock.mockResolvedValue({
      userId: 'user-123',
      communityId: 8,
      document: {
        id: 42,
        communityId: 8,
        title: 'Board Minutes',
        filePath: 'communities/8/documents/42/minutes.pdf',
        fileName: 'minutes.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
      },
    });
    createPresignedDownloadUrlMock.mockRejectedValueOnce(new Error('Storage unavailable'));

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/42/download?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '42' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(500);
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('logs preview access type when attachment is not set', async () => {
    resolveLibraryDocumentRequestMock.mockResolvedValue({
      userId: 'user-123',
      communityId: 8,
      document: {
        id: 42,
        communityId: 8,
        title: 'Board Minutes',
        filePath: 'communities/8/documents/42/minutes.pdf',
        fileName: 'minutes.pdf',
        mimeType: 'application/pdf',
        fileSize: 1024,
      },
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/42/download?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '42' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(200);
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'document_accessed',
        metadata: expect.objectContaining({
          accessType: 'preview',
        }),
      }),
    );
  });
});
