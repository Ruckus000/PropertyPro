/**
 * PR #2: Presigned-upload endpoint for community-site-assets.
 *
 * Step 1 of the two-step upload pattern. Client POSTs metadata; server
 * validates + checks plan/quota + returns a presigned URL. The client uses
 * the URL (or token) to upload bytes directly to Supabase Storage. The
 * finalize endpoint then runs sharp transformations.
 */
import { runRoute } from '@propertypro/api-contract';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { assertWithinQuota } from '@/lib/site-assets/quota';
import { buildSiteAssetPath, SITE_ASSETS_BUCKET } from '@/lib/site-assets/storage-paths';
import { createPresignedUploadUrl } from '@propertypro/db';
import { sitePresignContract } from './contract';

const PRESIGN_TTL_SECONDS = 60 * 60; // 1 hour — matches Supabase default

export const POST = withErrorHandler(
  runRoute(sitePresignContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    if (membership.role !== 'pm_admin') {
      throw new ForbiddenError('Only property managers can upload site assets');
    }
    await requirePlanFeature(communityId, 'hasSiteEditor');
    await assertWithinQuota(communityId, body.fileSize);

    const storagePath = buildSiteAssetPath(communityId, body.kind, body.filename);
    const signedUpload = await createPresignedUploadUrl(
      SITE_ASSETS_BUCKET,
      storagePath,
      { upsert: false },
    );

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const uploadUrl = signedUpload.signedUrl.startsWith('http')
      ? signedUpload.signedUrl
      : `${supabaseUrl ?? ''}${signedUpload.signedUrl}`;

    return {
      uploadUrl,
      token: signedUpload.token,
      storagePath,
      expiresAt: new Date(Date.now() + PRESIGN_TTL_SECONDS * 1000).toISOString(),
    };
  }),
);
