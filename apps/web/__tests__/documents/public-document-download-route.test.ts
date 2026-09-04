/**
 * `GET /api/v1/public/documents/[id]/download` — the only unauthenticated read
 * of the private `documents` storage bucket in the product.
 *
 * There is no session and no membership here, so the reader's filter IS the
 * authorization. These tests pin the two things that matter: a signed URL is
 * only ever minted for a row the reader returned, and a row it declines is
 * indistinguishable from one that does not exist.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const { createPresignedDownloadUrlMock, getPublicDocumentFileMock, logAuditEventMock } = vi.hoisted(
  () => ({
    createPresignedDownloadUrlMock: vi.fn(),
    getPublicDocumentFileMock: vi.fn(),
    logAuditEventMock: vi.fn(),
  }),
);

vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
  logAuditEvent: logAuditEventMock,
}));

vi.mock('@/lib/db/public-community-reader', () => ({
  getPublicCommunityScopedReader: (communityId: number) => ({
    communityId,
    getPublicDocumentFile: getPublicDocumentFileMock,
  }),
}));

import { GET } from '../../src/app/api/v1/public/documents/[id]/download/route';

const PUBLIC_DOCUMENT = {
  id: 7,
  filePath: 'community-42/bylaws.pdf',
  fileName: 'bylaws.pdf',
  mimeType: 'application/pdf',
};

function request(query = 'communityId=42') {
  return new NextRequest(`http://localhost/api/v1/public/documents/7/download?${query}`);
}

function params(id = '7') {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  getPublicDocumentFileMock.mockResolvedValue(PUBLIC_DOCUMENT);
  createPresignedDownloadUrlMock.mockResolvedValue('https://storage.example.com/signed');
});

describe('the public download', () => {
  it('redirects an anonymous visitor to a signed URL', async () => {
    const response = await GET(request(), params());

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://storage.example.com/signed');
    expect(getPublicDocumentFileMock).toHaveBeenCalledWith(7);
  });

  it('signs a short-lived URL, not the hour the authenticated route uses', async () => {
    await GET(request(), params());

    expect(createPresignedDownloadUrlMock).toHaveBeenCalledWith(
      'documents',
      'community-42/bylaws.pdf',
      300,
    );
  });

  it('404s — and mints nothing — for a document the reader will not release', async () => {
    // Private, soft-deleted, or in another community all arrive here as null.
    // This is the whole authorization: no row, no signed URL.
    getPublicDocumentFileMock.mockResolvedValue(null);

    const response = await GET(request(), params());

    expect(response.status).toBe(404);
    expect(createPresignedDownloadUrlMock).not.toHaveBeenCalled();
  });

  it('gives the same answer for a missing id as for a private one', async () => {
    // A distinguishable response would let an anonymous caller enumerate which
    // document ids exist in a community.
    getPublicDocumentFileMock.mockResolvedValue(null);

    const missing = await GET(request(), params('999999'));
    const privateDoc = await GET(request(), params('7'));

    expect(missing.status).toBe(privateDoc.status);
    await expect(missing.json()).resolves.toEqual(await privateDoc.json());
  });

  it('rejects a non-numeric document id', async () => {
    const response = await GET(request(), params('not-a-number'));

    expect(response.status).toBe(400);
    expect(getPublicDocumentFileMock).not.toHaveBeenCalled();
  });

  it('requires a communityId', async () => {
    const response = await GET(request(''), params());

    expect(response.status).toBe(400);
    expect(getPublicDocumentFileMock).not.toHaveBeenCalled();
  });

  it('writes no audit entry for anonymous traffic', async () => {
    // `compliance_audit_log` is append-only, permanent and board-readable. The
    // accountable act is PUBLISHING, which the PATCH audits.
    await GET(request(), params());

    expect(logAuditEventMock).not.toHaveBeenCalled();
  });
});
