/**
 * PR #2: Finalize a community-site-assets upload.
 *
 * Step 2 of the two-step upload pattern. The client has uploaded raw bytes
 * to the storagePath returned by /api/v1/site/uploads/presign. This route
 * downloads those bytes (via service-role admin client), applies sharp
 * transformations (optional crop + 1600w / 800w WebP variants), writes the
 * variants to sibling paths, increments the quota counter, audit-logs.
 */
import { runRoute } from '@propertypro/api-contract';
import { PM_SCOPE_DB_ROLES } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError, ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { incrementAssetsUsage } from '@/lib/site-assets/quota';
import { parseSiteAssetPath, SITE_ASSETS_BUCKET } from '@/lib/site-assets/storage-paths';
import { transformSiteImage } from '@/lib/site-assets/transform';
import { createAdminClient, logAuditEvent } from '@propertypro/db';
import { siteFinalizeContract } from './contract';

export const runtime = 'nodejs';
export const maxDuration = 30;

export const POST = withErrorHandler(
  runRoute(siteFinalizeContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    // BILINGUAL (role-v3): collapse to v3-only at Phase 4 cleanup
    if (!(PM_SCOPE_DB_ROLES as readonly string[]).includes(membership.role)) {
      throw new ForbiddenError('Only property managers can finalize site images');
    }
    await requirePlanFeature(communityId, 'hasSiteEditor');

    // Validate the storage path belongs to this community
    const parsed = parseSiteAssetPath(body.storagePath);
    if (!parsed || parsed.communityId !== communityId) {
      throw new ValidationError('storagePath does not belong to the supplied communityId');
    }

    const admin = createAdminClient();

    // Download raw bytes
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
    const rawBytes = Buffer.from(await blob.arrayBuffer());

    // Transform — sharp throws on corrupt/unsupported input; let withErrorHandler surface as 500
    const variants = await transformSiteImage(rawBytes, body.cropBox);

    // Upload BOTH variants
    const variant1600Path = `${body.storagePath}.1600w.webp`;
    const variant800Path = `${body.storagePath}.800w.webp`;

    // Track which variant paths landed in storage so we can compensate if
    // either upload fails (otherwise a 1600w success + 800w failure would
    // strand the 1600w forever — finalize throws, no quota increment, no
    // DB row, and the orphan isn't reachable for cleanup).
    const [result1600, result800] = await Promise.all([
      admin.storage.from(SITE_ASSETS_BUCKET).upload(variant1600Path, variants.at1600w, {
        contentType: 'image/webp',
        upsert: true,
      }),
      admin.storage.from(SITE_ASSETS_BUCKET).upload(variant800Path, variants.at800w, {
        contentType: 'image/webp',
        upsert: true,
      }),
    ]);
    if (result1600.error || result800.error) {
      // Compensate: remove whichever variant succeeded.
      const succeeded: string[] = [];
      if (!result1600.error) succeeded.push(variant1600Path);
      if (!result800.error) succeeded.push(variant800Path);
      if (succeeded.length > 0) {
        const { error: compErr } = await admin.storage
          .from(SITE_ASSETS_BUCKET)
          .remove(succeeded);
        if (compErr) {
          console.warn(
            `[site/images/finalize] compensating delete failed for ${succeeded.join(', ')}: ${compErr.message}`,
          );
        }
      }
      const firstErr = result1600.error?.message ?? result800.error?.message ?? 'unknown';
      throw new AppError(`Variant upload failed: ${firstErr}`, 500, 'UPLOAD_FAILED');
    }

    // Best-effort delete of the raw upload. The variants are the system of
    // record from here on; the original (up to 10MB) is no longer needed and
    // would otherwise accumulate as orphans and drift from quota tracking
    // (which counts variants only). Failures here are non-fatal — the
    // finalize succeeded.
    const { error: removeErr } = await admin.storage
      .from(SITE_ASSETS_BUCKET)
      .remove([body.storagePath]);
    if (removeErr) {
      console.warn(
        `[site/images/finalize] failed to remove raw upload ${body.storagePath}: ${removeErr.message}`,
      );
    }

    // Quota increment (combined size of both variants)
    const totalBytes = variants.at1600w.byteLength + variants.at800w.byteLength;
    await incrementAssetsUsage(communityId, totalBytes);

    // Audit log
    await logAuditEvent({
      userId,
      communityId,
      action: 'create',
      resourceType: 'site_image',
      resourceId: parsed.filename,
      metadata: { kind: parsed.kind, bytes: totalBytes, altText: body.altText },
    });

    return {
      variant1600Path,
      variant800Path,
      altText: body.altText,
    };
  }),
);
