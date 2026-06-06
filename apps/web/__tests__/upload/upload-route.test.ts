/**
 * Route unit tests — `POST /api/v1/upload`.
 *
 * Added alongside the Plan A1 auto-drain to `runRoute(contract, handler)`.
 * Covers the contracted envelope: happy path with all fields, image vs
 * document size caps, 401 unauth, 400 per body-validation field, 403
 * demo-grace (asserts membership NOT consulted when grace fires), 403
 * non-member, and the synthesized `{ data: ... }` wire shape consumers
 * (`use-upload-logo`, `useDocumentUpload`, `use-bulk-documents`) depend on.
 *
 * This route has NO `requirePermission` gate (any member may mint a presigned
 * URL) and mints a synthesized response object (no Drizzle row / no Dates).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';
import { ForbiddenError } from '../../src/lib/api/errors/ForbiddenError';

const {
  createPresignedUploadUrlMock,
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  assertNotDemoGraceMock,
} = vi.hoisted(() => ({
  createPresignedUploadUrlMock: vi.fn(),
  requireAuthenticatedUserIdMock: vi.fn(),
  requireCommunityMembershipMock: vi.fn(),
  resolveEffectiveCommunityIdMock: vi.fn(),
  assertNotDemoGraceMock: vi.fn(),
}));

vi.mock('@propertypro/db', () => ({
  createPresignedUploadUrl: createPresignedUploadUrlMock,
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

vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));

import { POST } from '../../src/app/api/v1/upload/route';

const SIGNED_UPLOAD = {
  token: 'signed-token',
  path: 'communities/42/documents/doc-1/test.pdf',
  signedUrl: 'https://example.supabase.co/storage/upload/signed',
};

function jsonPost(payload: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest('http://localhost:3000/api/v1/upload', {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
  });
}

const VALID_BODY = {
  communityId: 42,
  fileName: 'budget.pdf',
  fileSize: 2_000_000,
  mimeType: 'application/pdf',
};

describe('POST /api/v1/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    resolveEffectiveCommunityIdMock.mockReturnValue(42);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    requireCommunityMembershipMock.mockResolvedValue(undefined);
    createPresignedUploadUrlMock.mockResolvedValue(SIGNED_UPLOAD);
  });

  it('mints a presigned URL scoped to the community path (happy path)', async () => {
    const res = await POST(jsonPost(VALID_BODY));

    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      data: {
        documentId: string;
        path: string;
        token: string;
        uploadUrl: string;
        expiresIn: number;
      };
    };

    expect(resolveEffectiveCommunityIdMock).toHaveBeenCalledWith(expect.anything(), 42);
    expect(assertNotDemoGraceMock).toHaveBeenCalledWith(42);
    expect(requireCommunityMembershipMock).toHaveBeenCalledWith(42, 'user-1');
    expect(createPresignedUploadUrlMock).toHaveBeenCalledWith(
      'documents',
      expect.stringContaining('communities/42/documents/'),
      { upsert: false },
    );
    expect(json.data.path).toContain('communities/42/documents/');
    expect(json.data.token).toBe('signed-token');
    expect(json.data.uploadUrl).toContain('https://example.supabase.co');
    expect(json.data.expiresIn).toBe(15 * 60);
    expect(typeof json.data.documentId).toBe('string');
  });

  it('prefixes a relative signedUrl with NEXT_PUBLIC_SUPABASE_URL', async () => {
    const prev = process.env.NEXT_PUBLIC_SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://proj.supabase.co';
    createPresignedUploadUrlMock.mockResolvedValueOnce({
      ...SIGNED_UPLOAD,
      signedUrl: '/storage/upload/relative',
    });

    const res = await POST(jsonPost(VALID_BODY));

    expect(res.status).toBe(200);
    const json = (await res.json()) as { data: { uploadUrl: string } };
    expect(json.data.uploadUrl).toBe('https://proj.supabase.co/storage/upload/relative');

    process.env.NEXT_PUBLIC_SUPABASE_URL = prev;
  });

  it('returns 401 when unauthenticated', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(jsonPost(VALID_BODY));

    expect(res.status).toBe(401);
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when body is missing communityId', async () => {
    const { communityId: _omit, ...rest } = VALID_BODY;
    const res = await POST(jsonPost(rest));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when fileName is empty', async () => {
    const res = await POST(jsonPost({ ...VALID_BODY, fileName: '' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when mimeType is empty', async () => {
    const res = await POST(jsonPost({ ...VALID_BODY, mimeType: '' }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('returns 400 VALIDATION_ERROR when fileSize is not positive', async () => {
    const res = await POST(jsonPost({ ...VALID_BODY, fileSize: 0 }));

    expect(res.status).toBe(400);
    const json = (await res.json()) as { error: { code: string } };
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('returns 400 when an image exceeds the 10MB image cap', async () => {
    const res = await POST(
      jsonPost({
        ...VALID_BODY,
        fileName: 'huge-image.png',
        mimeType: 'image/png',
        fileSize: 15 * 1024 * 1024,
      }),
    );

    expect(res.status).toBe(400);
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('allows a document up to the 50MB document cap', async () => {
    const res = await POST(
      jsonPost({
        ...VALID_BODY,
        fileSize: 40 * 1024 * 1024,
        mimeType: 'application/pdf',
      }),
    );

    expect(res.status).toBe(200);
    expect(createPresignedUploadUrlMock).toHaveBeenCalled();
  });

  it('returns 403 during the demo grace window (before membership runs)', async () => {
    assertNotDemoGraceMock.mockRejectedValueOnce(new ForbiddenError('Demo expired'));

    const res = await POST(jsonPost(VALID_BODY));

    expect(res.status).toBe(403);
    expect(requireCommunityMembershipMock).not.toHaveBeenCalled();
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller is not a member of the community', async () => {
    requireCommunityMembershipMock.mockRejectedValueOnce(
      new ForbiddenError('Not a member of this community'),
    );

    const res = await POST(jsonPost(VALID_BODY));

    expect(res.status).toBe(403);
    expect(createPresignedUploadUrlMock).not.toHaveBeenCalled();
  });
});
