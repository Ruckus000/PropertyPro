/**
 * P3-47: White-label branding API for property managers.
 *
 * GET  /api/v1/pm/branding?communityId=X  — read current branding
 * PATCH /api/v1/pm/branding               — update branding (partial)
 *
 * Plan A1 drain #174 — both methods migrated to `runRoute(contract, handler)`;
 * see `./contract.ts`.
 *
 * Authorization: caller must hold property_manager_admin in the target community.
 *
 * Logo processing:
 *   The client uploads the raw file via POST /api/v1/upload (presigned URL).
 *   On PATCH the API server fetches those raw bytes from Supabase Storage,
 *   processes them through sharp (resize 400×400, WebP q80), and re-uploads
 *   to the canonical path communities/{id}/branding/logo.webp before persisting.
 */
import { runRoute } from '@propertypro/api-contract';
import { PM_SCOPE_DB_ROLES } from '@propertypro/shared';
import { createPresignedDownloadUrl, createPresignedUploadUrl, logAuditEvent } from '@propertypro/db';
import { withErrorHandler } from '@/lib/api/error-handler';
import { ForbiddenError, ValidationError } from '@/lib/api/errors';
import { requireAuthenticatedUserId } from '@/lib/api/auth';
import { requireCommunityMembership } from '@/lib/api/community-membership';
import { resolveEffectiveCommunityId } from '@/lib/api/tenant-context';
import { getBrandingForCommunity, updateBrandingForCommunity } from '@/lib/api/branding';
import { requirePlanFeature } from '@/lib/middleware/plan-guard';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { resizeLogo, resizeSiteLogo } from '@/lib/services/image-processor';
import { tryAutoComplete } from '@/lib/services/onboarding-checklist-service';
import { getPmBrandingContract, patchPmBrandingContract } from './contract';

const PRESIGN_TTL_SECONDS = 60 * 60;
const ALLOWED_LOGO_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;

/**
 * Download a raw uploaded image from storage, validate its type, run it
 * through `resize`, and re-upload the processed WebP to the canonical branding
 * path `communities/{id}/branding/{canonicalName}`. Returns that canonical
 * path. Shared by the square avatar logo (resizeLogo) and the wordmark site
 * logo (resizeSiteLogo).
 */
async function processAndStoreBrandingImage(
  communityId: number,
  storagePath: string,
  resize: (input: Buffer) => Promise<Buffer>,
  canonicalName: string,
): Promise<string> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const rawSignedUrl = await createPresignedDownloadUrl('documents', storagePath, PRESIGN_TTL_SECONDS);
  const signedUrl = rawSignedUrl.startsWith('http')
    ? rawSignedUrl
    : new URL(rawSignedUrl, supabaseUrl).toString();
  const res = await fetch(signedUrl);
  if (!res.ok) {
    throw new ValidationError('Could not fetch uploaded logo from storage');
  }
  const rawBuffer = Buffer.from(await res.arrayBuffer());

  const { fileTypeFromBuffer } = await import('file-type');
  const detectedType = await fileTypeFromBuffer(rawBuffer);
  if (!detectedType || !(ALLOWED_LOGO_MIMES as readonly string[]).includes(detectedType.mime)) {
    throw new ValidationError('Invalid image file: only PNG, JPEG, and WebP are accepted');
  }

  const processedBuffer = await resize(rawBuffer);
  const canonicalPath = `communities/${communityId}/branding/${canonicalName}`;
  const signedUpload = await createPresignedUploadUrl('documents', canonicalPath, { upsert: true });
  const uploadUrl = signedUpload.signedUrl.startsWith('http')
    ? signedUpload.signedUrl
    : new URL(signedUpload.signedUrl, supabaseUrl).toString();
  const uploadRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': 'image/webp' },
    body: new Uint8Array(processedBuffer),
  });
  if (!uploadRes.ok) {
    throw new ValidationError('Failed to save processed logo');
  }
  return canonicalPath;
}

export const GET = withErrorHandler(
  runRoute(getPmBrandingContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    // BILINGUAL (role-v3): collapse to v3-only at Phase 4 cleanup
    if (!(PM_SCOPE_DB_ROLES as readonly string[]).includes(membership.role)) {
      throw new ForbiddenError('Only property managers can access branding settings');
    }

    const branding = await getBrandingForCommunity(communityId);
    return branding ?? {};
  }),
);

export const PATCH = withErrorHandler(
  runRoute(patchPmBrandingContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    // BILINGUAL (role-v3): collapse to v3-only at Phase 4 cleanup
    if (!(PM_SCOPE_DB_ROLES as readonly string[]).includes(membership.role)) {
      throw new ForbiddenError('Only property managers can update branding settings');
    }

    if (body.customCssOverrides !== undefined) {
      await requirePlanFeature(communityId, 'hasSiteCustomCss');
    }

    let canonicalLogoPath: string | undefined;
    if (body.logoStoragePath) {
      canonicalLogoPath = await processAndStoreBrandingImage(
        communityId,
        body.logoStoragePath,
        resizeLogo,
        'logo.webp',
      );
    }

    let canonicalSiteLogoPath: string | undefined;
    if (body.siteLogoStoragePath) {
      canonicalSiteLogoPath = await processAndStoreBrandingImage(
        communityId,
        body.siteLogoStoragePath,
        resizeSiteLogo,
        'site-logo.webp',
      );
    }

    const {
      communityId: _communityId,
      logoStoragePath: _logoStoragePath,
      siteLogoStoragePath: _siteLogoStoragePath,
      primaryColor,
      secondaryColor,
      accentColor,
      fontHeading,
      fontBody,
      customEmailFooter,
      customCssOverrides,
    } = body;

    const updated = await updateBrandingForCommunity(communityId, {
      ...(primaryColor !== undefined && { primaryColor }),
      ...(secondaryColor !== undefined && { secondaryColor }),
      ...(accentColor !== undefined && { accentColor }),
      ...(fontHeading !== undefined && { fontHeading }),
      ...(fontBody !== undefined && { fontBody }),
      ...(canonicalLogoPath !== undefined && { logoPath: canonicalLogoPath }),
      ...(canonicalSiteLogoPath !== undefined && { siteLogoPath: canonicalSiteLogoPath }),
      ...(customEmailFooter !== undefined && { customEmailFooter }),
      ...(customCssOverrides !== undefined && { customCssOverrides }),
    });

    await logAuditEvent({
      userId,
      action: 'settings_changed',
      resourceType: 'community',
      resourceId: String(communityId),
      communityId,
      newValues: updated as Record<string, unknown>,
    });

    void tryAutoComplete(communityId, userId, 'customize_portal');

    return updated;
  }),
);
