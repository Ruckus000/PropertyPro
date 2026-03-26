import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';
import { NotFoundError } from '../../src/lib/api/errors/NotFoundError';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

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

describe('document download route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPresignedDownloadUrlMock.mockResolvedValue('https://storage.example.com/signed-url');
    resolveLibraryDocumentRequestMock.mockRejectedValue(new NotFoundError('Document not found'));
  });

  it('returns signed URL metadata for a valid document', async () => {
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
    const json = (await res.json()) as {
      data: { url: string; fileName: string; mimeType: string; fileSize: number };
    };

    expect(res.status).toBe(200);
    expect(json.data).toEqual({
      url: 'https://storage.example.com/signed-url',
      fileName: 'minutes.pdf',
      mimeType: 'application/pdf',
      fileSize: 1024,
    });
    expect(createPresignedDownloadUrlMock).toHaveBeenCalledWith(
      'documents',
      'communities/8/documents/42/minutes.pdf',
      3600,
    );
  });

  it('redirects to a signed URL when attachment=true', async () => {
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

  it('maps missing storage objects to DOCUMENT_FILE_MISSING', async () => {
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
    createPresignedDownloadUrlMock.mockRejectedValueOnce(
      new Error('Failed to create presigned download URL: Object not found'),
    );

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/42/download?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '42' }) };

    const res = await GET(req, context);
    const json = (await res.json()) as { error: { code: string; message: string } };

    expect(res.status).toBe(500);
    expect(json.error.code).toBe('DOCUMENT_FILE_MISSING');
    expect(json.error.message).toBe('Document file is missing from storage');
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('maps generic storage failures to DOCUMENT_STORAGE_UNAVAILABLE', async () => {
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
    const json = (await res.json()) as { error: { code: string; message: string } };

    expect(res.status).toBe(503);
    expect(json.error.code).toBe('DOCUMENT_STORAGE_UNAVAILABLE');
    expect(json.error.message).toBe('Document storage is temporarily unavailable');
    expect(logAuditEventMock).not.toHaveBeenCalled();
  });

  it('logs document_accessed only on successful preview metadata generation', async () => {
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
          fileName: 'minutes.pdf',
        }),
      }),
    );
  });

  it('returns 404 for non-existent documents', async () => {
    resolveLibraryDocumentRequestMock.mockRejectedValueOnce(new NotFoundError('Document not found'));

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/999/download?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '999' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(404);
  });

  it('returns 401 for unauthenticated requests', async () => {
    resolveLibraryDocumentRequestMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/42/download?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '42' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(401);
  });

  it('returns 403 for non-members', async () => {
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

  it('validates the communityId parameter', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/42/download?communityId=invalid',
    );
    const context = { params: Promise.resolve({ id: '42' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(400);
  });

  it('validates the document ID', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/invalid/download?communityId=8',
    );
    const context = { params: Promise.resolve({ id: 'invalid' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(400);
  });
});
