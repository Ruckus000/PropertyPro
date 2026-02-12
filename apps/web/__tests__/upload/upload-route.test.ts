import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const { createPresignedUploadUrlMock, requireAuthenticatedUserIdMock } = vi.hoisted(() => ({
  createPresignedUploadUrlMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createPresignedUploadUrl: createPresignedUploadUrlMock,
}));

vi.mock('@/lib/api/auth', () => ({
  requireAuthenticatedUserId: requireAuthenticatedUserIdMock,
}));

import { POST } from '../../src/app/api/v1/upload/route';

describe('p1-11 upload presign route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    createPresignedUploadUrlMock.mockResolvedValue({
      token: 'signed-token',
      path: 'communities/42/documents/doc-1/test.pdf',
      signedUrl: 'https://example.supabase.co/storage/upload/signed',
    });
  });

  it('returns presigned URL scoped to community path', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/upload', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        fileName: 'budget.pdf',
        fileSize: 2_000_000,
        mimeType: 'application/pdf',
      }),
    });

    const res = await POST(req);
    const body = (await res.json()) as {
      data: { path: string; token: string; uploadUrl: string };
    };

    expect(res.status).toBe(200);
    expect(createPresignedUploadUrlMock).toHaveBeenCalledWith(
      'documents',
      expect.stringContaining('communities/42/documents/'),
      { upsert: false },
    );
    expect(body.data.path).toContain('communities/42/documents/');
    expect(body.data.token).toBe('signed-token');
    expect(body.data.uploadUrl).toContain('https://example.supabase.co');
  });

  it('rejects unauthenticated requests', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const req = new NextRequest('http://localhost:3000/api/v1/upload', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        fileName: 'budget.pdf',
        fileSize: 2_000_000,
        mimeType: 'application/pdf',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('enforces size limits by mime type', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/upload', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        communityId: 42,
        fileName: 'huge-image.png',
        fileSize: 15 * 1024 * 1024,
        mimeType: 'image/png',
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
  });
});
