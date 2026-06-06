/**
 * Upload — mint a presigned Supabase Storage upload URL (direct browser upload).
 *
 * POST /api/v1/upload
 * Body: { communityId, fileName, mimeType, fileSize }
 *
 * Plan A1 auto-drain. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for the schema and rationale. Auth chain preserved verbatim:
 *   requireAuthenticatedUserId
 *     → resolveEffectiveCommunityId(req, body.communityId)
 *     → assertNotDemoGrace        (async, awaited)
 *     → requireCommunityMembership(async, awaited)
 *     → validateFileSize(mimeType, fileSize)
 *     → createPresignedUploadUrl('documents', storagePath, { upsert: false })
 *
 * This route is intentionally non-audited. It generates presigned URLs for
 * direct upload to Supabase Storage but does not mutate app records. Document
 * record creation (which IS audited) happens in POST /api/v1/documents.
 *
 * Body validation moves from the hand-rolled `presignSchema.safeParse` →
 * `ValidationError('Invalid upload metadata')` to the contract's Zod schema,
 * so validation failures now surface the canonical `VALIDATION_ERROR`
 * envelope. The per-mimeType size cap stays in the handler (it depends on
 * both `mimeType` and `fileSize`) and keeps its byte-identical message.
 * Success wire shape `{ data: ... }` is byte-identical to pre-migration.
 */
import { runRoute } from '@propertypro/api-contract';
import { createPresignedUploadUrl } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { sanitizeFilename } from '@/lib/utils/sanitize-filename';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { uploadPresignContract } from './contract';

const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const PRESIGN_TTL_SECONDS = 15 * 60;

function validateFileSize(mimeType: string, fileSize: number): void {
  const isImage = mimeType.startsWith('image/');
  const limit = isImage ? MAX_IMAGE_BYTES : MAX_DOCUMENT_BYTES;

  if (fileSize > limit) {
    throw new ValidationError(
      `File exceeds maximum allowed size (${limit} bytes) for ${isImage ? 'images' : 'documents'}`,
    );
  }
}

export const POST = withErrorHandler(
  runRoute(uploadPresignContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();

    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const { fileName, fileSize, mimeType } = body;
    await requireCommunityMembership(communityId, userId);
    validateFileSize(mimeType, fileSize);

    const documentId = crypto.randomUUID();
    const safeFileName = sanitizeFilename(fileName);
    const storagePath = `communities/${communityId}/documents/${documentId}/${safeFileName}`;

    const signedUpload = await createPresignedUploadUrl('documents', storagePath, {
      upsert: false,
    });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    const uploadUrl = signedUpload.signedUrl.startsWith('http')
      ? signedUpload.signedUrl
      : `${supabaseUrl ?? ''}${signedUpload.signedUrl}`;

    return {
      documentId,
      path: storagePath,
      token: signedUpload.token,
      uploadUrl,
      expiresIn: PRESIGN_TTL_SECONDS,
    };
  }),
);
