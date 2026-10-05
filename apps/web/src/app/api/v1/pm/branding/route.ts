/**
 * P3-47: White-label branding API for property managers.
 *
 * GET  /api/v1/pm/branding?communityId=X  — read current branding
 * PATCH /api/v1/pm/branding               — update the live-only branding
 *                                           fields: logos and email footer.
 *                                           The site's look is a v4 draft,
 *                                           saved via /api/v1/pm/site/design
 *                                           (see ./contract.ts).
 *
 * Plan A1 drain #174 — both methods migrated to `runRoute(contract, handler)`;
 * see `./contract.ts`.
 *
 * Authorization: caller must hold a management role (property_manager /
 * root_manager) in the target community. Note this route does NOT call
 * `requireRole` — both handlers inline a `PM_SCOPE_DB_ROLES.includes(...)`
 * membership test, so there is no alias expansion and no shared guard.
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
import { requireEntitledForAdminRead } from '@/lib/middleware/read-entitlement-guard';
import { getBrandingForCommunity, updateBrandingForCommunity } from '@/lib/api/branding';
import { assertNotDemoGrace } from '@/lib/middleware/demo-grace-guard';
import { resizeLogo, resizeSiteLogo } from '@/lib/services/image-processor';
import { assertCommunityOwnedStoragePath } from '@/lib/services/storage-validators';
import { resolveBrandingImageUrl } from '@/lib/branding/branding-image-url';
import type { CommunityBranding } from '@propertypro/shared';
import { getPmBrandingContract, patchPmBrandingContract, type PmBranding } from './contract';

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

/** The live-only fields this route owns, with each logo resolved to a URL. */
async function toPmBranding(communityId: number, branding: CommunityBranding): Promise<PmBranding> {
  const [logoUrl, siteLogoUrl] = await Promise.all([
    resolveBrandingImageUrl(communityId, branding.logoPath),
    resolveBrandingImageUrl(communityId, branding.siteLogoPath),
  ]);
  return {
    logoPath: branding.logoPath || null,
    logoUrl,
    siteLogoPath: branding.siteLogoPath || null,
    siteLogoUrl,
    customEmailFooter: branding.customEmailFooter ?? null,
  };
}

export const GET = withErrorHandler(
  runRoute(getPmBrandingContract, async ({ query, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, query.communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    // role-v3: this role set is v3-only — ['property_manager','root_manager'].
    if (!(PM_SCOPE_DB_ROLES as readonly string[]).includes(membership.role)) {
      throw new ForbiddenError('Only property managers can access branding settings');
    }
    // Lapsed communities lose admin reads (residents unaffected — guard short-circuits).
    await requireEntitledForAdminRead(communityId, membership);

    const branding = await getBrandingForCommunity(communityId);
    return toPmBranding(communityId, branding ?? {});
  }),
);

export const PATCH = withErrorHandler(
  runRoute(patchPmBrandingContract, async ({ body, req }) => {
    const userId = await requireAuthenticatedUserId();
    const communityId = resolveEffectiveCommunityId(req, body.communityId);
    await assertNotDemoGrace(communityId);
    const membership = await requireCommunityMembership(communityId, userId);
    // role-v3: this role set is v3-only — ['property_manager','root_manager'].
    if (!(PM_SCOPE_DB_ROLES as readonly string[]).includes(membership.role)) {
      throw new ForbiddenError('Only property managers can update branding settings');
    }

    // Both paths are caller-supplied and the copy below runs with the service
    // role, so without this a manager of A could name B's private document and
    // have it copied into A's branding, where A can read it.
    if (body.logoStoragePath) {
      assertCommunityOwnedStoragePath(body.logoStoragePath, communityId, 'documents', 'logoStoragePath');
    }
    if (body.siteLogoStoragePath) {
      assertCommunityOwnedStoragePath(
        body.siteLogoStoragePath,
        communityId,
        'documents',
        'siteLogoStoragePath',
      );
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

    const patch = {
      ...(canonicalLogoPath !== undefined && { logoPath: canonicalLogoPath }),
      ...(canonicalSiteLogoPath !== undefined && { siteLogoPath: canonicalSiteLogoPath }),
      ...(body.customEmailFooter !== undefined && { customEmailFooter: body.customEmailFooter }),
    };
    // `null` removes a logo. The processed file at communities/{id}/branding/
    // stays in storage; the next upload overwrites it.
    const remove = [
      ...(body.logoStoragePath === null ? (['logoPath'] as const) : []),
      ...(body.siteLogoStoragePath === null ? (['siteLogoPath'] as const) : []),
    ];

    const updated = await updateBrandingForCommunity(communityId, patch, { remove });

    // The changed fields only. The whole branding object now carries the
    // manager's unpublished draft (`draftLook`) and site settings, none of
    // which this request touched.
    await logAuditEvent({
      userId,
      action: 'settings_changed',
      resourceType: 'community',
      resourceId: String(communityId),
      communityId,
      newValues: {
        ...patch,
        ...Object.fromEntries(remove.map((key) => [key, null])),
      },
    });

    return toPmBranding(communityId, updated);
  }),
);
