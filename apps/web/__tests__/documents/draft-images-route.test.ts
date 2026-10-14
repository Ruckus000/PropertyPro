import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { UnauthorizedError } from '../../src/lib/api/errors/UnauthorizedError';

const {
  requireAuthenticatedUserIdMock,
  requireCommunityMembershipMock,
  resolveEffectiveCommunityIdMock,
  requirePermissionMock,
  assertNotDemoGraceMock,
  getDocumentDraftAuthorshipMock,
  createPresignedDownloadUrlMock,
  createAdminClientMock,
  fileTypeFromBufferMock,
  sharpMock,
  uploadMock,
} = vi.hoisted(() => {
  const uploadMock = vi.fn().mockResolvedValue({ error: null });
  const pipeline: Record<string, unknown> = {};
  for (const m of ['rotate', 'resize', 'png', 'webp', 'jpeg']) {
    pipeline[m] = vi.fn(() => pipeline);
  }
  pipeline.toBuffer = vi.fn().mockResolvedValue(Buffer.from('processed-image'));
  return {
    requireAuthenticatedUserIdMock: vi.fn(),
    requireCommunityMembershipMock: vi.fn(),
    resolveEffectiveCommunityIdMock: vi.fn((_: unknown, id: number) => id),
    requirePermissionMock: vi.fn(),
    assertNotDemoGraceMock: vi.fn().mockResolvedValue(undefined),
    getDocumentDraftAuthorshipMock: vi.fn(),
    createPresignedDownloadUrlMock: vi.fn().mockResolvedValue('https://storage/signed'),
    createAdminClientMock: vi.fn(() => ({
      storage: { from: () => ({ upload: uploadMock }) },
    })),
    fileTypeFromBufferMock: vi.fn(),
    sharpMock: vi.fn(() => pipeline),
    uploadMock,
  };
});

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
  requirePermission: requirePermissionMock,
}));
vi.mock('@/lib/middleware/demo-grace-guard', () => ({
  assertNotDemoGrace: assertNotDemoGraceMock,
}));
vi.mock('@/lib/services/document-draft-service', () => ({
  getDocumentDraftAuthorship: getDocumentDraftAuthorshipMock,
}));
vi.mock('@propertypro/db', () => ({
  createPresignedDownloadUrl: createPresignedDownloadUrlMock,
}));
vi.mock('@propertypro/db/supabase/admin', () => ({
  createAdminClient: createAdminClientMock,
}));
vi.mock('file-type', () => ({
  fileTypeFromBuffer: fileTypeFromBufferMock,
}));
vi.mock('sharp', () => ({ default: sharpMock }));

import { POST } from '../../src/app/api/v1/documents/drafts/[id]/images/route';

const ADMIN_MEMBERSHIP = {
  role: 'property_manager',
  isAdmin: true,
  isUnitOwner: false,
  communityId: 1,
  userId: 'user-1',
  communityType: 'condo_718',
};

/**
 * Build a POST request whose multipart "file" has an arbitrary declared
 * Content-Type and byte payload. The sniffed type is controlled separately via
 * `fileTypeFromBufferMock`, which is the whole point: the route must trust the
 * sniff, not the declared `blobType`.
 */
function makeReq(blobType: string, bytes = new Uint8Array([1, 2, 3, 4])) {
  const file = new File([bytes], 'upload', { type: blobType });
  const fd = new FormData();
  fd.set('file', file);
  const req = new NextRequest(
    'http://localhost/api/v1/documents/drafts/5/images?communityId=1',
    { method: 'POST' },
  );
  // Deterministic: avoid depending on multipart body (de)serialization.
  (req as unknown as { formData: () => Promise<FormData> }).formData = async () => fd;
  return req;
}

const ctx = { params: Promise.resolve({ id: '5' }) };

describe('POST /api/v1/documents/drafts/[id]/images', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuthenticatedUserIdMock.mockResolvedValue('user-1');
    requireCommunityMembershipMock.mockResolvedValue(ADMIN_MEMBERSHIP);
    resolveEffectiveCommunityIdMock.mockImplementation((_: unknown, id: number) => id);
    requirePermissionMock.mockReturnValue(undefined);
    assertNotDemoGraceMock.mockResolvedValue(undefined);
    getDocumentDraftAuthorshipMock.mockResolvedValue({ authorId: 'user-1', deletedAt: null });
    createPresignedDownloadUrlMock.mockResolvedValue('https://storage/signed');
    fileTypeFromBufferMock.mockResolvedValue({ mime: 'image/png', ext: 'png' });
  });

  // Revert-check target: the route sniffs the real bytes
  // (`detectedMime = (await fileTypeFromBuffer(inputBytes))?.mime`) and gates on
  // the SNIFFED type. If that line is reverted to the old client-declared
  // `ALLOWED_MIMES.has(file.type)` check, this case reaches sharp (200) instead
  // of being rejected (400) — i.e. a disguised AVIF/HEIF/SVG/TIFF reaches the
  // native decoder. That is exactly the sharp-CVE attack surface this closes.
  it('rejects a file whose bytes are a disallowed format even when Content-Type says image/png', async () => {
    fileTypeFromBufferMock.mockResolvedValueOnce({ mime: 'image/avif', ext: 'avif' });

    const res = await POST(makeReq('image/png'), ctx);

    expect(res.status).toBe(400);
    expect(sharpMock).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it('rejects when the bytes have no detectable type (file-type returns undefined)', async () => {
    fileTypeFromBufferMock.mockResolvedValueOnce(undefined);

    const res = await POST(makeReq('image/png'), ctx);

    expect(res.status).toBe(400);
    expect(sharpMock).not.toHaveBeenCalled();
  });

  it('accepts a genuine PNG and re-encodes it through sharp', async () => {
    fileTypeFromBufferMock.mockResolvedValueOnce({ mime: 'image/png', ext: 'png' });

    const res = await POST(makeReq('image/png'), ctx);

    expect(res.status).toBe(200);
    expect(sharpMock).toHaveBeenCalledTimes(1);
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  // The encode branch keys off the SNIFFED mime, not the declared Content-Type:
  // a file announced as image/png but actually WebP is re-encoded as WebP.
  // Revert-check: changing the route's branch conditions back to `file.type ===`
  // makes this output image/png (matching the declared type) instead of webp.
  it('drives the output format off the sniffed type (declared png, bytes webp → webp)', async () => {
    fileTypeFromBufferMock.mockResolvedValueOnce({ mime: 'image/webp', ext: 'webp' });

    const res = await POST(makeReq('image/png'), ctx);

    expect(res.status).toBe(200);
    expect(sharpMock).toHaveBeenCalledTimes(1);
    const json = (await res.json()) as { data: { mimeType: string; path: string } };
    expect(json.data.mimeType).toBe('image/webp');
    expect(json.data.path.endsWith('.webp')).toBe(true);
  });

  it('passes a genuine GIF through untouched (never hands it to sharp)', async () => {
    fileTypeFromBufferMock.mockResolvedValueOnce({ mime: 'image/gif', ext: 'gif' });

    const res = await POST(makeReq('image/gif'), ctx);

    expect(res.status).toBe(200);
    expect(sharpMock).not.toHaveBeenCalled();
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it('returns 403 when the caller is neither author nor admin', async () => {
    requireCommunityMembershipMock.mockResolvedValueOnce({
      ...ADMIN_MEMBERSHIP,
      role: 'resident',
      isAdmin: false,
      isUnitOwner: true,
    });
    getDocumentDraftAuthorshipMock.mockResolvedValueOnce({ authorId: 'someone-else', deletedAt: null });

    const res = await POST(makeReq('image/png'), ctx);

    expect(res.status).toBe(403);
    expect(sharpMock).not.toHaveBeenCalled();
  });

  it('returns 401 for an unauthenticated caller', async () => {
    requireAuthenticatedUserIdMock.mockRejectedValueOnce(new UnauthorizedError());

    const res = await POST(makeReq('image/png'), ctx);

    expect(res.status).toBe(401);
    expect(sharpMock).not.toHaveBeenCalled();
  });
});
