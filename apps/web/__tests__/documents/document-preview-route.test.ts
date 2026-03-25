import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
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

import { GET } from '../../src/app/api/v1/documents/[id]/preview/route';

describe('document preview route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
          status: 200,
          headers: {
            'content-length': '4',
          },
        }),
      ),
    );
    createPresignedDownloadUrlMock.mockResolvedValue('https://storage.example.com/preview.pdf');
    resolveLibraryDocumentRequestMock.mockResolvedValue({
      userId: 'user-123',
      communityId: 8,
      document: {
        id: 42,
        communityId: 8,
        filePath: 'communities/8/documents/42/minutes.pdf',
        fileName: 'minutes.pdf',
        mimeType: 'application/pdf',
      },
    });
  });

  it('streams a same-origin PDF preview with inline headers and audit metadata', async () => {
    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/42/preview?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '42' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('inline');
    expect(res.headers.get('Cache-Control')).toBe('private, no-store');
    expect(logAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-123',
        communityId: 8,
        metadata: expect.objectContaining({
          accessType: 'inline_preview',
          fileName: 'minutes.pdf',
        }),
      }),
    );
  });

  it('returns 404 when the document is not accessible', async () => {
    resolveLibraryDocumentRequestMock.mockRejectedValueOnce(new NotFoundError('Document not found'));

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/42/preview?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '42' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(404);
  });

  it('returns 401 when auth fails', async () => {
    resolveLibraryDocumentRequestMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/42/preview?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '42' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(401);
  });

  it('rejects non-pdf previews', async () => {
    resolveLibraryDocumentRequestMock.mockResolvedValueOnce({
      userId: 'user-123',
      communityId: 8,
      document: {
        id: 42,
        communityId: 8,
        filePath: 'communities/8/documents/42/photo.png',
        fileName: 'photo.png',
        mimeType: 'image/png',
      },
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/documents/42/preview?communityId=8',
    );
    const context = { params: Promise.resolve({ id: '42' }) };

    const res = await GET(req, context);

    expect(res.status).toBe(400);
  });
});
