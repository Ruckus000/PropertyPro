/**
 * Inline image upload for an authored document draft.
 *
 * Accepts a single image via multipart/form-data, validates type + size,
 * runs through sharp to strip EXIF and re-encode, uploads to Supabase
 * Storage under the draft's namespace, and returns a public URL the editor
 * can drop into the body. The URL must match the sanitizeAuthoredHtml
 * <img src> allowlist (Supabase host) — verified on next PATCH.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import sharp from 'sharp';
import {
  createAdminClient,
  createPresignedDownloadUrl,
} from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { requirePermission } from '@/lib/db/access-control';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { getDocumentDraftAuthorship } from '@/lib/services/document-draft-service';

export const runtime = 'nodejs';
export const maxDuration = 30;

const querySchema = z.object({ communityId: z.coerce.number().int().positive() });

const ALLOWED_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_DIMENSION = 2400;

function parseDraftId(rawId: string): number {
  const n = Number(rawId);
  if (!Number.isInteger(n) || n <= 0) throw new ValidationError('draft id must be positive integer');
  return n;
}

export const POST = withErrorHandler(
  async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
    const userId = await requireAuthenticatedUserId();
    const { id: rawId } = await params;
    const draftId = parseDraftId(rawId);

    const { searchParams } = new URL(req.url);
    const parsedQuery = querySchema.safeParse({
      communityId: searchParams.get('communityId') ?? undefined,
    });
    if (!parsedQuery.success) {
      throw new ValidationError('communityId required', {
        fields: formatZodErrors(parsedQuery.error),
      });
    }
    const communityId = resolveEffectiveCommunityId(req, parsedQuery.data.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    requirePermission(membership, 'documents', 'write');

    const draft = await getDocumentDraftAuthorship(communityId, draftId);
    if (!draft || draft.deletedAt) throw new NotFoundError('Draft not found');
    const isAuthor = draft.authorId === userId;
    if (!isAuthor && !membership.isAdmin) {
      throw new ForbiddenError('Not authorized to upload to this draft');
    }

    const formData = await req.formData();
    let file: Blob | null = null;
    for (const [key, value] of (formData as unknown as Iterable<[string, FormDataEntryValue]>)) {
      if (key === 'file' && value instanceof Blob) {
        file = value;
        break;
      }
    }
    if (!file) throw new ValidationError('Multipart "file" field required');
    if (!ALLOWED_MIMES.has(file.type)) {
      throw new ValidationError('Unsupported image type. Use PNG, JPEG, WebP, or GIF.');
    }
    if (file.size > MAX_BYTES) {
      throw new ValidationError(`Image exceeds ${MAX_BYTES} bytes`);
    }

    const inputBytes = new Uint8Array(await file.arrayBuffer());

    // sharp: re-encode (strips EXIF) and clamp max dimension. We preserve
    // the original format for PNG/JPEG/WebP; GIFs are passed through.
    const isGif = file.type === 'image/gif';
    let outputBytes: Uint8Array;
    let outputMime: string;
    let outputExt: string;
    if (isGif) {
      outputBytes = inputBytes;
      outputMime = 'image/gif';
      outputExt = 'gif';
    } else {
      const pipeline = sharp(inputBytes, { failOn: 'error' }).rotate().resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });
      let buffer: Buffer;
      if (file.type === 'image/png') {
        buffer = await pipeline.png({ compressionLevel: 9 }).toBuffer();
        outputMime = 'image/png';
        outputExt = 'png';
      } else if (file.type === 'image/webp') {
        buffer = await pipeline.webp({ quality: 88 }).toBuffer();
        outputMime = 'image/webp';
        outputExt = 'webp';
      } else {
        buffer = await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
        outputMime = 'image/jpeg';
        outputExt = 'jpg';
      }
      outputBytes = new Uint8Array(buffer);
    }

    const objectId = crypto.randomUUID();
    const path = `authored-assets/${communityId}/${draftId}/${objectId}.${outputExt}`;

    const admin = createAdminClient();
    const { error } = await admin.storage.from('documents').upload(path, outputBytes, {
      contentType: outputMime,
      upsert: false,
    });
    if (error) {
      throw new AppError(`Image upload failed: ${error.message}`, 500, 'IMAGE_UPLOAD_FAILED');
    }

    // Return a long-lived signed URL (1 day). The sanitizer's <img src>
    // allowlist accepts URLs whose host matches SUPABASE_URL.
    const signedUrl = await createPresignedDownloadUrl('documents', path, 60 * 60 * 24);

    return NextResponse.json({
      data: {
        url: signedUrl,
        path,
        mimeType: outputMime,
        size: outputBytes.byteLength,
      },
    });
  },
);
