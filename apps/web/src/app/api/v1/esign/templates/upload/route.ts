import crypto from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { createPresignedUploadUrl } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { ValidationError } from '@/lib/api/errors';
import { formatZodErrors } from '@/lib/api/zod/error-formatter';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { requireEsignWritePermission } from '@/lib/esign/esign-route-helpers';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { sanitizeFilename } from '@/lib/utils/sanitize-filename';

const MAX_TEMPLATE_BYTES = 50 * 1024 * 1024;
const PRESIGN_TTL_SECONDS = 15 * 60;

const uploadSchema = z.object({
  communityId: z.number().int().positive(),
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().positive().max(MAX_TEMPLATE_BYTES),
  mimeType: z.literal('application/pdf'),
});

export const POST = withErrorHandler(async (req: NextRequest) => {
  const actorUserId = await requireAuthenticatedUserId();
  const body: unknown = await req.json();
  const parseResult = uploadSchema.safeParse(body);

  if (!parseResult.success) {
    throw new ValidationError('Invalid e-sign template upload metadata', {
      fields: formatZodErrors(parseResult.error),
    });
  }

  const communityId = parseCommunityIdFromBody(req, parseResult.data.communityId);
  const membership = await requireCommunityMembership(communityId, actorUserId);

  await requireEsignWritePermission(membership);
  await requirePlanFeature(communityId, 'hasEsign');

  const safeFileName = sanitizeFilename(parseResult.data.fileName);
  const storagePath = `communities/${communityId}/esign-templates/${crypto.randomUUID()}-${safeFileName}`;

  const signedUpload = await createPresignedUploadUrl('documents', storagePath, {
    upsert: false,
  });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const uploadUrl = signedUpload.signedUrl.startsWith('http')
    ? signedUpload.signedUrl
    : `${supabaseUrl ?? ''}${signedUpload.signedUrl}`;

  return NextResponse.json({
    data: {
      path: storagePath,
      token: signedUpload.token,
      uploadUrl,
      expiresIn: PRESIGN_TTL_SECONDS,
    },
  });
});
