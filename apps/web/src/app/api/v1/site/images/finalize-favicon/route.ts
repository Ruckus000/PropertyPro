/**
 * Website editor v3, Phase 8 — finalize a favicon upload.
 *
 * Mirrors `site/images/finalize` step for step (download raw bytes as
 * service-role → sharp → upload variants → compensate on partial failure →
 * best-effort delete the raw upload → quota) and then does one extra thing:
 * it records the result in `communities.branding` itself.
 *
 * That last part is the reason this is not a two-request flow. A separate
 * follow-up PATCH would leave an orphan window — variants written and quota
 * incremented, then the browser dies, and the community is charged for bytes
 * nothing references and nothing can find. Folding the write in closes it.
 *
 * Replacing an existing favicon also releases the old one: delete first, and
 * decrement the quota only if the delete succeeded. Decrementing after a failed
 * delete under-counts permanently and eventually lets a community past its plan
 * ceiling.
 */
import { runRoute } from '@propertypro/api-contract';
import { PM_SCOPE_DB_ROLES } from '@propertypro/shared';
import { withErrorHandler } from '@/lib/api/error-handler';
import { AppError, ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { decrementAssetsUsage, incrementAssetsUsage } from '@/lib/site-assets/quota';
import { parseSiteAssetPath, SITE_ASSETS_BUCKET } from '@/lib/site-assets/storage-paths';
import { resizeFavicon } from '@/lib/services/image-processor';
import { setSiteFavicon } from '@/lib/services/site-settings-service';
import { createAdminClient } from '@propertypro/db/supabase/admin';
import { faviconFinalizeContract } from './contract';

export const runtime = 'nodejs';
export const maxDuration = 30;

export const POST = withErrorHandler(
  runRoute(faviconFinalizeContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    if (!(PM_SCOPE_DB_ROLES as readonly string[]).includes(membership.role)) {
      throw new ForbiddenError('Only property managers can finalize a favicon');
    }
    await requirePlanFeature(communityId, 'hasSiteEditor');

    // The path must belong to THIS community and be a favicon upload. Without
    // the kind check a caller could point this route at their own hero image
    // and have it silently re-encoded into the favicon slot — harmless, but the
    // parser/writer symmetry is the thing keeping storage paths meaningful.
    const parsed = parseSiteAssetPath(body.storagePath);
    if (!parsed || parsed.communityId !== communityId) {
      throw new ValidationError('storagePath does not belong to the supplied communityId');
    }
    if (parsed.kind !== 'favicon') {
      throw new ValidationError('storagePath is not a favicon upload');
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
    const rawBytes = Buffer.from(await blob.arrayBuffer());

    // sharp throws on corrupt/unsupported input; withErrorHandler surfaces it.
    // Its default `limitInputPixels` (~268 MP) is what stops a decompression
    // bomb from being decoded at all.
    const variants = await resizeFavicon(rawBytes);

    const icon32Path = `${body.storagePath}.32.png`;
    const appleTouch180Path = `${body.storagePath}.180.png`;

    // Track which variant paths landed so a partial failure can be compensated
    // — a 32 success plus a 180 failure would otherwise strand the 32 forever
    // (route throws, no quota increment, no branding row, nothing to clean up).
    const [result32, result180] = await Promise.all([
      admin.storage.from(SITE_ASSETS_BUCKET).upload(icon32Path, variants.icon32, {
        contentType: 'image/png',
        upsert: true,
      }),
      admin.storage.from(SITE_ASSETS_BUCKET).upload(appleTouch180Path, variants.appleTouch180, {
        contentType: 'image/png',
        upsert: true,
      }),
    ]);
    if (result32.error || result180.error) {
      const succeeded: string[] = [];
      if (!result32.error) succeeded.push(icon32Path);
      if (!result180.error) succeeded.push(appleTouch180Path);
      if (succeeded.length > 0) {
        const { error: compErr } = await admin.storage
          .from(SITE_ASSETS_BUCKET)
          .remove(succeeded);
        if (compErr) {
          console.warn(
            `[site/images/finalize-favicon] compensating delete failed for ${succeeded.join(', ')}: ${compErr.message}`,
          );
        }
      }
      const firstErr = result32.error?.message ?? result180.error?.message ?? 'unknown';
      throw new AppError(`Favicon variant upload failed: ${firstErr}`, 500, 'UPLOAD_FAILED');
    }

    // Best-effort delete of the raw upload — the variants are the system of
    // record and quota counts variants only. Non-fatal.
    const { error: removeErr } = await admin.storage
      .from(SITE_ASSETS_BUCKET)
      .remove([body.storagePath]);
    if (removeErr) {
      console.warn(
        `[site/images/finalize-favicon] failed to remove raw upload ${body.storagePath}: ${removeErr.message}`,
      );
    }

    await incrementAssetsUsage(
      communityId,
      variants.icon32.byteLength + variants.appleTouch180.byteLength,
    );

    // Records the new favicon and reports what it replaced. Audit-logged there.
    const { previous } = await setSiteFavicon({
      communityId,
      actorUserId: userId,
      favicon: { icon32Path, appleTouch180Path },
    });

    // Release the replaced variants. Delete FIRST; decrement only on success,
    // so a storage failure leaves the quota over-counting (recoverable) rather
    // than under-counting (silently lets the community exceed its plan).
    if (previous) {
      const stale = [previous.icon32Path, previous.appleTouch180Path].filter(
        (p) => p !== icon32Path && p !== appleTouch180Path,
      );
      if (stale.length > 0) {
        const { error: staleErr } = await admin.storage
          .from(SITE_ASSETS_BUCKET)
          .remove(stale);
        if (staleErr) {
          console.warn(
            `[site/images/finalize-favicon] failed to remove replaced favicon ${stale.join(', ')}: ${staleErr.message}`,
          );
        } else {
          // Only the bytes actually removed. The previous sizes are not known
          // here, so re-measure is not possible — the current variants are a
          // close proxy and both are tiny; over- or under-shooting by a few KiB
          // on a multi-MB quota is not worth a second storage round trip.
          await decrementAssetsUsage(
            communityId,
            variants.icon32.byteLength + variants.appleTouch180.byteLength,
          );
        }
      }
    }

    return { icon32Path, appleTouch180Path };
  }),
);
