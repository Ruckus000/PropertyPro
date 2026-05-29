/**
 * E-sign template source upload — presigned URL minting.
 *
 * Plan A1 drain #135. Migrated to `runRoute(contract, handler)`; see
 * `./contract.ts` for schemas and auth-chain rationale.
 */
import crypto from 'node:crypto';
import { runRoute } from '@propertypro/api-contract';
import { createPresignedUploadUrl } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { parseCommunityIdFromBody } from '@/lib/finance/request';
import { requireEsignWritePermission } from '@/lib/esign/esign-route-helpers';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { sanitizeFilename } from '@/lib/utils/sanitize-filename';
import { esignTemplateUploadContract } from './contract';

const PRESIGN_TTL_SECONDS = 15 * 60;

export const POST = withErrorHandler(
  runRoute(esignTemplateUploadContract, async ({ body, req }) => {
    const actorUserId = await requireAuthenticatedUserId();
    const communityId = parseCommunityIdFromBody(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, actorUserId);

    await requireEsignWritePermission(membership);
    await requirePlanFeature(communityId, 'hasEsign');

    const safeFileName = sanitizeFilename(body.fileName);
    const storagePath = `communities/${communityId}/esign-templates/${crypto.randomUUID()}-${safeFileName}`;

    const signedUpload = await createPresignedUploadUrl('documents', storagePath, {
      upsert: false,
    });
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const uploadUrl = signedUpload.signedUrl.startsWith('http')
      ? signedUpload.signedUrl
      : `${supabaseUrl ?? ''}${signedUpload.signedUrl}`;

    return {
      path: storagePath,
      token: signedUpload.token,
      uploadUrl,
      expiresIn: PRESIGN_TTL_SECONDS,
    };
  }),
);
