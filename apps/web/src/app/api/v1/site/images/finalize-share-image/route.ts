/**
 * Website builder v4, Phase 5 — finalize the site's sharing image.
 *
 * `finalize-favicon` step for step: download the raw upload as service-role →
 * sharp → upload the variant → best-effort delete the raw upload → quota →
 * record it in branding → release the image it replaced. One variant instead
 * of two, so there is no partial-upload compensation to do.
 *
 * Releasing the replaced image deletes first and decrements only on success —
 * a failed delete then over-counts (recoverable) rather than under-counts
 * (silently lets a community past its plan). Unlike the favicon, the exact
 * bytes are known: they are stored with the image.
 */
import { runRoute } from '@/lib/api/run-route';
import { PM_SCOPE_DB_ROLES } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError, ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { decrementAssetsUsage, incrementAssetsUsage } from '@/lib/site-assets/quota';
import { parseSiteAssetPath, SITE_ASSETS_BUCKET } from '@/lib/site-assets/storage-paths';
import { resizeShareImage } from '@/lib/services/image-processor';
import { setSiteShareImage } from '@/lib/services/site-settings-service';
// AUTHZ: site-assets storage, on a path parseSiteAssetPath proves belongs to this community, after the property-manager check
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { shareImageFinalizeContract } from './contract';

export const runtime = 'nodejs';
export const maxDuration = 30;

export const POST = withErrorHandler(
  runRoute(shareImageFinalizeContract, async ({ body, communityId }) => {
    await assertNotDemoGrace(communityId);
    const userId = await requireAuthenticatedUserId();
    const membership = await requireCommunityMembership(communityId, userId);
    if (!(PM_SCOPE_DB_ROLES as readonly string[]).includes(membership.role)) {
      throw new ForbiddenError('Only property managers can set the sharing image');
    }
    await requirePlanFeature(communityId, 'hasSiteEditor');

    const parsed = parseSiteAssetPath(body.storagePath);
    if (!parsed || parsed.communityId !== communityId) {
      throw new ValidationError('storagePath does not belong to the supplied communityId');
    }
    if (parsed.kind !== 'share') {
      throw new ValidationError('storagePath is not a sharing-image upload');
    }

    const admin = createAdminClient();

    const { data: blob, error: downloadErr } = await admin.storage
      .from(SITE_ASSETS_BUCKET)
      .download(body.storagePath);
    if (downloadErr || !blob) {
      throw new AppError(
        `Failed to download raw upload: ${downloadErr?.message ?? 'no data returned'}`,
        500,
        'DOWNLOAD_FAILED',
      );
    }

    // sharp throws on corrupt/unsupported input; withErrorHandler surfaces it.
    const image = await resizeShareImage(Buffer.from(await blob.arrayBuffer()));
    const path = `${body.storagePath}.1200x630.jpg`;

    const { error: uploadErr } = await admin.storage
      .from(SITE_ASSETS_BUCKET)
      .upload(path, image, { contentType: 'image/jpeg', upsert: true });
    if (uploadErr) {
      throw new AppError(`Sharing image upload failed: ${uploadErr.message}`, 500, 'UPLOAD_FAILED');
    }

    const { error: removeErr } = await admin.storage
      .from(SITE_ASSETS_BUCKET)
      .remove([body.storagePath]);
    if (removeErr) {
      console.warn(
        `[site/images/finalize-share-image] failed to remove raw upload ${body.storagePath}: ${removeErr.message}`,
      );
    }

    await incrementAssetsUsage(communityId, image.byteLength);

    const shareImage = { path, bytes: image.byteLength };
    const { previous } = await setSiteShareImage({ communityId, actorUserId: userId, shareImage });

    if (previous && previous.path !== path) {
      const { error: staleErr } = await admin.storage
        .from(SITE_ASSETS_BUCKET)
        .remove([previous.path]);
      if (staleErr) {
        console.warn(
          `[site/images/finalize-share-image] failed to remove replaced image ${previous.path}: ${staleErr.message}`,
        );
      } else if (previous.bytes > 0) {
        await decrementAssetsUsage(communityId, previous.bytes);
      }
    }

    return shareImage;
  }),
);
